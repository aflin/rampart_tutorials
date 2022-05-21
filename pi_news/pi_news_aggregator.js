#!/usr/local/bin/rampart

rampart.globalize(rampart.utils);

var Sql    = require("rampart-sql");
var curl   = require("rampart-curl");
var html   = require("rampart-html");
var robots = require("rampart-robots");
var urlutil= require("rampart-url");
var dbdir  = process.scriptPath + "/web_server/data/pi_news"

var sql = new Sql.init(dbdir, true);

// The date format we are expecting from http servers
var dateFmt = "%a, %d %b %Y %H:%M:%S GMT";

var crawlDelay = 10;  // go slow - delay in seconds between fetches from same site.

// Columns for our table
// status, fetch_count, server_date, fetch_date, site, url, img_url, title, text
var schema = "status smallint, fetch_count smallint, server_date date, fetch_date date, " +
             "site varchar(8), url varchar(64), img_url varchar(64), title varchar(64), " +
             "text varchar(1024)";

// running in two stages - first gets all articles from several index pages
//                       - second gets latest articles from main index page
// First stage is done by running with command line argument '--first-run'
var firstRun = false;
if ( process.argv[2] == '--first-run' )
    firstRun=true;

/* details of each scrape:
    url                - the index page with links to the latest articles
    urlNextFmt         - more index pages with links to articles
    initialPages       - how many pages with links to articles to grab on first run
    entryClass         - the CSS class of the element holding article links, for index pages
    entryImgClass      - the CSS class of the element on the index pages with a related image
    contentClass       - on article page, the CSS of element that holds most relevant text
    contentImgClass    - the CSS class of the element on the content pages with a related image
    contentRemoveClass - the CSS class of elements on the content pages inside contentClass that should be removed
*/

var sites = {
    "hackaday":
    {
        name: "hackaday",
        url: "https://hackaday.com/category/raspberry-pi-2/",
        urlNextFmt: "https://hackaday.com/category/raspberry-pi-2/page/%d/",
        initialPages: 8,        
        entryClass: "entry-featured-image",
        contentImgClass: "entry-featured-image",
        contentClass: 'post'
    },
    "raspberrypi":
    {
        name: "raspberrypi",
        url: "https://www.raspberrypi.com/news/",
        urlNextFmt: "https://www.raspberrypi.com/news/page/%d/",
        initialPages: 5,
        entryClass: "c-blog-post-card__link",
        entryImgClass: "c-blog-post-card__image",
        contentClass: "c-blog-post-content",
        contentRemoveClass: ["c-blog-post-content__footer"]
    },
    "makeuseof":
    {
        name: "makeuseof",
        url: "https://www.makeuseof.com/search/raspberry%20pi/",
        urlNextFmt: "https://www.makeuseof.com/search/raspberry%%20pi/%d/",
        initialPages: 3,
        entryClass: "bc-title-link",
        entryImgClass: "bc-img",
        contentClass: "article",
        contentRemoveClass: ["sidebar", "next-btn", "sharing", "letter-from"]
    }
}

// the names of our sites.
var sitenames = Object.keys(sites);

// status < 0 -- try or retry
// status > 0 -- don't retry
// status = 0 -- first try
// status > 0 and < 100 - custom codes
var statTexts = {
"1": "Disallowed by robots.txt",
"2": "Cannot parse Url",
"-1": "Error retrieving robots.txt"
}

var robotstxt = {}; //load these once per run
var userAgent = "rampart_tutorial";  //our identification

// fetch with robots.txt check
function fetch(url) {
    var comp = urlutil.components(url);
    var origin, res;
    if(!comp)
        return {status: 2, statusText: statTexts[2]};

    origin=comp.origin;

    if(!robotstxt[origin]) {
        var rurl = origin + '/robots.txt'
        printf("fetching %s\r", rurl);
        fflush(stdout);

        // body is a buffer.  robots.isAllowed also takes a buffer, so we can dispense with text.
        res = curl.fetch(rurl, {"user-agent": userAgent, returnText: false, location:true});
        printf("%d    - %s\n", res.status, rurl);
        if(res.status==200) {
            robotstxt[origin]=res.body;
        } else if (res.status > 399) {
            robotstxt[origin]=-1;
        } else {
            // there are other possibilities not covered here
            return {status: -1, statusText: statTexts[-1]};
        }
    }

    // if there is a robots.txt, and this url is disallowed, return status=1
    if(robotstxt[origin]!=-1 && !robots.isAllowed(userAgent, robotstxt[origin], url) ) {
        return {status: 1, statusText: statTexts[1]};
    }

    printf("fetching %s\r", url);
    fflush(stdout);
    res = curl.fetch (url, {"user-agent": userAgent, returnText: false, location:true});
    printf("%d    - %s\n", res.status, url);
    if(res.status > 499) res.status *= -1;  //return negative on server error, so we will retry

    return res;
}

// process the index page holding links to articles
function procIndex(site, docBody) {
    var doc = html.newDocument(docBody);

    var entries = doc.findClass(site.entryClass);

    var images;
    if(site.entryImgClass) {
        images = doc.findClass(site.entryImgClass);
    }

    var insertRows = [];

    for (var i=0; i<entries.length; i++) {
        var row={site: site.name};
        var entry = entries.eq(i);
        var atag;
        if(entry.hasTag("a")[0])
            atag=entry;
        else
            atag = entry.findTag("a");

        row.url = atag.getAttr("href");

        if(row.url.length)
            row.url = urlutil.absUrl(site.url, row.url[0]);
        if(images && images.length) {
            var image = images.eq(i);
            if (image.length) {
                var imgtag = image.findTag("source"); //makeuseof
                if(imgtag.length) {
                    imgtag = imgtag.eq(0);
                    var srcset = imgtag.getAttr("data-srcset");
                    if(srcset[0]=='') {
                        srcset = imgtag.getAttr("srcset");
                    }
                    if(srcset.length)
                        row.img_url = srcset;
                } else { //raspberrypi
                    if(image.hasTag("img")[0])
                        imgtag = image;
                    else
                        imgtag = image.findTag("img");

                    row.img_url = imgtag.getAttr("src");

                }
            }
            if(row.img_url && row.img_url.length)
                row.img_url = row.img_url[0];
        }
        
        insertRows.push(row);
    }
    return insertRows;
}

// get single key response without \n
function getresp(def, len) {
    var l = (len)? len: 1;
    var ret = stdin.getchar(l);
    if(ret == '\n')
        return def;
    printf("\n");
    return ret.toLowerCase();
}

// drop table if exists, but ask first
function clean_database() {
    if( sql.one("select * from SYSTABLES where NAME = 'pipages';") ) {
        printf('Table "pipages" exists. Drop it and delete all saved pages?\n [y/N]: ');
        fflush(stdout); //flush text after \n
        var resp = getresp('n'); //default no
        if(resp == 'n') {
            process.exit(0);
        }
        sql.exec("drop table pipages;");
        if(sql.errMsg != '') {
            printf("Error dropping table:\n%s",sql.errMsg);
            process.exit(0);
        }
    }
}

function create_table() {
    // create using schema
    sql.exec(`create table pipages (${schema});`);
    // unique index on url, so we don't have duplicates
    sql.exec('create unique index pipages_url_ux on pipages(url);');
}

// update a row of data in our table
function update_row(data) {
    var keys = Object.keys(data);

    // build our "set" section of sql statement
    // based on what we have in *data*
    // should look like "text=?text, title=?title, ..."
    var sqlstr="update pipages set ";
    var j=0;
    for (var i = 0; i<keys.length; i++) {
        var key = keys[i];
        if(key == 'url')
            continue;
        if(j)
            sqlstr += ", "+key + "=?" + key;
        else
            sqlstr += key + "=?" + key;
        j++;
    }

    // if we only have data.url, there's nothing to update
    if(!j)
        return;

    printf("updating %s\n",data.url);

    var res = sql.exec(sqlstr + " where url=?url;", data);

    if(sql.errMsg) {
        printf("sql update error, cannot continue:\n%s",sql.errMsg);
        process.exit(1);
    }
    return res;
}

//properties we need in the substitution parameters object when doing an insert
var empty_params = {
    status:0,
    fetch_count:0,
    server_date:0,
    fetch_date:0,
    img_url:"",
    title:"",
    text:""
}

// insert a new row into our table
function insert_row(data) {
    var dfilled = {};                     // start with empty object
    Object.assign(dfilled, empty_params); // add default empty params 
    Object.assign(dfilled, data);         // overwrite params with what we have

    var res = sql.exec("insert into pipages values " +
        "(?status, ?fetch_count, ?server_date, ?fetch_date, ?site, ?url, ?img_url, ?title, ?text);",
        dfilled
    );    

    // if duplicate, sql.errMsg will be set with "duplicate value" message and res.rowCount == 0
    // Checking res.rowCount first is likely faster
    if (!res.rowCount && sql.errMsg.includes("Trying to insert duplicate value") ) {
        res.isDup=true;
        // remove sql.errMsg
        sql.errMsg = '';
    }
    return res;
}

// check for new articles in the main index page (sites[].url)
function check_new_articles() {
    // check that our table exists
    if( ! sql.one("select * from SYSTABLES where NAME = 'pipages';") ) {
        console.log(
            'Error: table "pipages" does not exist.\n' +
            'If this is the first time running this script, run it with\n' +
            `${process.argv[1]} --first-run`
       );
        process.exit(1);
    }

    for (var i=0; i< sitenames.length; i++) {
        var site = sites[sitenames[i]];
        var res;

        printf("Getting new article urls for %s\n", site.url);

        res = fetch(site.url);

        var urllist = procIndex(site, res.body);
        for (var j=0; j<urllist.length; j++) {
            printf("checking     %s - \r", urllist[j].url)
            fflush(stdout);
            var sqlres = insert_row(urllist[j]);
            if(sqlres.isDup)
                printf("exists:      %s\n", urllist[j].url);
            else
                printf("NEW ARTICLE: %s\n", urllist[j].url);
        }
    }
}

// on first run, get main index page and a few more index pages
function first_run() {
    var i,j,k;

    clean_database();
    create_table();

    for (i=0; i< sitenames.length; i++) {
        var site = sites[sitenames[i]];
        var res;

        printf("Getting new article urls for %s\n", site.url);

        res = fetch(site.url);
        if(res.status != 200) {
            printf("error getting '%s':\n    %s\n", site.url, res.statusText);
            process.exit(1);
        }

        // extract urls of articles
        var urllist = procIndex(site, res.body);
        // insert urls into table
        for (j=0; j<urllist.length; j++) {
            insert_row(urllist[j]);
        }

        // go slow
        sleep(crawlDelay);

        // get second and subsequent pages up to site.initialPages
        for (k=2; k<=site.initialPages;k++) {
            var purl = sprintf(site.urlNextFmt, k);

            res = fetch(purl);
            if(res.status != 200) {
                printf("error getting '%s':\n    %s\n", site.url, res.statusText);
                process.exit(1);
            }

            // extract urls of articles
            var urllist = procIndex(site, res.body);
            // insert urls into table
            for (j=0; j<urllist.length; j++) {
                insert_row(urllist[j]);
            }

            //sleep unless at end
            if( k < site.initialPages)
                sleep(crawlDelay);
        }
    }
}

// get relevant text and info from article html
function procpage(site, dbrow, fetch_res) {
    var row = {
        url:dbrow.url, 
        fetch_date:'now', 
        fetch_count: dbrow.fetch_count +1
    };
    var image, imgtag;

    // get server date
    if(typeof fetch_res.headers.Date == 'string')
        row.server_date = scanDate(fetch_res.headers.Date, dateFmt);
    else if(typeof fetch_res.headers.date == 'string')
        row.server_date = scanDate(fetch_res.headers.date, dateFmt);
    else
        row.server_date = 'now';

    var doc = html.newDocument(fetch_res.body);
    // the content is located in an element with CSS class *site.contentClass*
    var content = doc.findClass(site.contentClass);

    // remove from content items we don't want
    if(site.contentRemoveClass) {
        for (var i=0;i<site.contentRemoveClass.length;i++) {
            content.findClass( site.contentRemoveClass[i] ).delete();
        }
    }

    // makeuseof has an easier to grab image in the article
    if(site.contentImgClass) {
        image=doc.findClass( site.contentImgClass );
        if(image.hasTag("img")[0])
            imgtag = image;
        else
            imgtag = image.findTag("img");

        if(imgtag.length)
            row.img_url = imgtag.getAttr("src")[0];
    }

    // extract the text from the content html
    row.text = content.toText({concatenate:true, titleText: true});

    // find the <title> tag text
    var title = doc.findTag('title');
    if(title.length)
        row.title = title.eq(0).toText()[0];

    return row;
}

/*
    Regular indexes are updated on each insert/update.
    Text indexes, however, need to be manually updated.
      -  When a new row is inserted, it still is available for search,
         but that search is a linear scan of the document, so it is slower.
      -  A text index can be updated with either:
          1) sql.exec("alter index pipages_text_ftx OPTIMIZE");
              or
          2) issuing the same command that created the index as in make_index() below.
         Here we will issue the same command when creating and updating for simplicity.
*/

function make_index(){
    // we want to match "Check out the new pi 4." if we search for "pi 4"
    // so we add an expression for [\s\,]\d+[\s,\.] (in PERLRE), but only matching the number(s)
    sql.exec(
        "create fulltext index pipages_text_ftx on pipages(text) " +
        "WITH WORDEXPRESSIONS "+
        "('[\\alnum\\x80-\\xFF]{2,99}', '[\\space\\,]\\P=\\digit+\\F[\\space,\\.]=') "+
        "INDEXMETER 'on'");

}

// interval ID needed to cancel setInteral when all pages have been fetched;
var iId = {};

// status, fetch_count, server_date, fetch_date, site, url, img_url, text

//fetch, process and update table
function fetch_article(sitename) {
    var row;
    var res = sql.one("select * from pipages where site=? and status<1 and fetch_count<10 order by status DESC",
                [sitename] );
    if(!res) {
        printf("%s is up to date\n", sitename);
        // no more pages to fetch, so cancel interval
        clearInterval(iId[sitename]);
        delete iId[sitename]; // get rid of entry so we know we are done with it
        // final action before script exits:
        if(Object.keys(iId).length == 0) {
            printf("updating fulltext index\n");
            make_index();
        }
        return;
    }

    var site = sites[res.site];

    // fetch the page
    var cres = fetch(res.url);
    if(cres.status != 200 ) {
        // failed
        update_row({
            url:res.url,
            status: cres.status,
            fetch_count: res.fetch_count + 1
        });            
    } else {
        // success
        row=procpage(site, res, cres);
        row.status=200;
        update_row(row);
    }
}

// get article pages asynchronously using setInterval
function fetch_all_articles(){
    for (var i = 0; i < sitenames.length; i++) {
        var site = sites[sitenames[i]];

        var res = sql.one("select * from pipages where site=? and status<1 and fetch_count<10 order by status DESC",
                    [sitenames[i]] );

        if (res) { // only if we have some sites, otherwise we'd waste crawlDelay seconds just to exit

            // this complicated mess is to make sure our *sitenames[i].name*
            // is scoped to the setInterval callback and stays the same 
            // even as the *site* variable changes in subsequent *for* loops.

            // if you are unfamiliar with this technique and immediately invoked functions - see:
            // https://www.google.com/search?q=iife+settimeout

            // scope sitename in an IIFE
            (function(sn) {
                iId[sn] = setInterval(
                    function() { fetch_article(sn);}, 
                    crawlDelay * 1000
                );
            })(site.name);

            /* or use IIFE to return a function with sitename scoped. Result is the same.
            iId[site.name] = setInterval(
                (function(sn) { 
                    return function() {
                        fetch_article(sn);
                    }
                })(site.name),
                crawlDelay * 1000
            );
            */
        }
    }

}

// get index pages
if(firstRun) {
    first_run();
} else {
    check_new_articles();
}

// get article pages
fetch_all_articles();
