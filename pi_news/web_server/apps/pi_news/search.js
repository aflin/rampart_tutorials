/* The PI NEWS Demo Search Module

   Everything outside the 'search()' function below is run once (per thread) when
   the module is loaded.  The 'module.exports=search` is the exported function
   which is run once per client request.

   Note that this means that variables set outside the 'search()' function are 
   long lived and span multiple requests by potentially multiple clients.  As
   such, care should be taken that these variables do not include any information
   which should not be shared between clients.
*/

// Load the sql module.  This only needs to be done once
var Sql=require("rampart-sql");

// process.scriptPath is the path of the web_server_conf.js, not
// the path of this module script. For the path of this module, 
// use 'module.path'.
var db=process.scriptPath + '/data/pi_news';

// Open the db.
var sql=new Sql.init(db);

// make printf = rampart.utils.printf
// See: https://rampart.dev/docs/rampart-main.html#rampart-globalize
rampart.globalize(rampart.utils);

/* 
Example of some settings to modify search weights which can be used to use
to tune the search results.  These values are just examples and are not
tuned for this search.
See: https://rampart.dev/docs/sql-set.html#rank-knobs
and  https://rampart.dev/docs/sql-set.html#other-ranking-properties
    sql.set({
        "likepallmatch":false,
        "likepleadbias":250,
        "likepproximity":750,
        "likeprows":2000,
    });

NOTE ALSO:  
     Here the 'sql' variable is set when the module is loaded.  Any changes
     made in 'search()' below using sql.set() will be carried forward for
     the next client (per server thread).  If you have settings (as set in
     'sql.set()') that change per request or per client, it is highly
     advisable that you call 'sql.reset()' at the beginning of the exported
     'search()' function below followed by a `sql.set()` call to make the
     behavioral changes desired.
     
     If the sql.set() call is intended for every client and every search,
     setting it here is not problematic.
*/

// we want "pi 4" query to match "Check out the new pi 4."
// so we set qminwordlen to 1, the shortest word in a query (normally 2).
// We also set wordexpressions to:
//      ('[\\alnum\\x80-\\xFF]{2,99}', '[\\space\\,]\\P=\\digit+\\F[\\space,\\.]=')
// in the scraping script so that single digits will be indexed.
// In another context, this might be counter productive as it polutes the index, but
// here we have a small table and a greater need to match single digits. 
sql.set({ "qminwordlen":1 });

/* 
 the top section of html only needs to be set once as it remains the same
 regardless of the request.  Here it is set when the module is first loaded. 
 This is a printf style format string so that the query text box may be
 filled if, e.g., ?q=pi+4 is set.

 The sprintf(%w', format_string): 
    This removes leading white space so it can be pretty 
    here in the source but compact when sent. 
    See https://rampart.dev/docs/rampart-utils.html#printf
*/
var htmltop_format=sprintf('%w',
`<!DOCTYPE HTML>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-1BmE4kWBq78iYhFldvKuhfTAU6auU8tT94WrHftjDbrCEXSU1oBoqyl2QvZ6jIW3" crossorigin="anonymous">
      <style>
        body {font-family: arial,sans-serif;}
        .urlsp {color:#006621;max-width:100%%;overflow: hidden;text-overflow: ellipsis;white-space:nowrap;display:inline-block;font-size:.90em;}
        .urla {text-decoration: none;font-size:16px;overflow: hidden;text-overflow: ellipsis;white-space:nowrap;display:inline-block; width: 100%%; }
        .res {margin-top: 80px !important;}
        .img-cover{object-fit: cover; aspect-ratio:5/3}
      </style>
    </head>
    <body>
    <nav style="z-index:1" class="navbar position-fixed top-0 w-100 navbar-expand-lg navbar-light bg-light">
      <div class="container-fluid">
        <a class="navbar-brand m-auto p-2" href="#">
          【Ｒａｍｐａｒｔ : Ｐｉ Ｎｅｗｓ】
        </a>
        <form style="width:100%%" id="mf" action="/apps/pi_news/search.html">
          <div class="input-group mb-2">
            <input autocomplete="off" type="text" id="fq" name="q" value="%H" placeholder="Search" class="form-control">
            <button class="btn btn-outline-secondary" type="submit">Search</button>
          </div>
        </form>
      </div>
    </nav>
`
);



function search(req) {
    var q=req.query.q ? req.query.q: "";

    // req.query.skip in, e.g. "/apps/pi_news/search.html?q=pi&skip=10" is text.
    // Make it a JavaScript number.
    var skip=parseInt( req.query.skip );

    var icount=0;  //estimated total number of results, set below
    var endhtml;   // closing tags, set below
    var nres=12;   // number of results per page

    // add the htmltop text to the server's output buffer.
    // See: https://rampart.dev/docs/rampart-server.html#req-printf
    // it includes escaped '%%' values and the 'value="%H"' format code for the query
    req.printf(htmltop_format, q);

    if (!skip)skip=0;

    var sqlStatement;
    // if there is a query, search for it and format the results.
    // if not, just send the latest articles.

    if(req.query.q) {
        /* The SQL statement:
       
           %mbH in stringformat() means highlight with bold and html escape. 
           See: https://rampart.dev/docs/rampart-sql.html#metamorph-hit-mark-up
                https://rampart.dev/docs/sql-server-funcs.html#stringformat

           "@0 " is added to the abstract query to allow partial matches to be
           highlighted (i.e.  if a two word query, but only one word is in the
           abstract).  
           See https://docs.thunderstone.com/site/texisman/specifying_no_intersections_or.html

           abstract(text[, maxsize[, style[, query]]]) will create an abstract:  
              - text is the table field from which to create an abstract.
              - 0 (or <0) means use the default maximum size of 230 characters.
              - 'querymultiple' is a style which will break up the abstract into multiple sections if necessary
              - '?' is replaced with the JavaScript variable 'q'
        */
        sqlStatement = "select url, img_url, title, stringformat('%mbH','@0 '+?query,abstract(text, 0,'querymultiple',?query)) Ab from pipages where text likep ?query";
    } else {
        /* if no query, get latest articles */
        sqlStatement = "select url, img_url, title, abstract(text) Ab from pipages order by server_date DESC";
    }

    // by default, only the first 100 rows are returned for any likep search.
    // if we are skipping past that, we need to raise the likeprows setting.
    if(skip + nres > 100 )
        sql.set({likeprows:skip + nres});
    else
        sql.set({likeprows:100}); //reset to default in case previously set
    // sql.exec(statement, params, settings, callback);
    sql.exec(
        sqlStatement,
        // the parameters for each '?query' in the above statement
        {query: q},

        // options
        {maxRows:nres,skipRows:skip,includeCounts:true},

        // callback is executed once per retrieved row.
        function(res,i,cols,info) {
            /* res = {url: www, img_url:xxx, title:"yyy", Ab:"zzz"}
             * i = current row, beginning at skip, ending at or before skip + nres
             * cols = ["url", "img_url", "title", "Ab"] - the columns returned from the SQL statement
             * includeCounts sets info to an object detailing the number of possible matches to a "likep" query. */

            // before the first row
            if(i==skip) {
                icount=parseInt(info.indexCount);
                req.printf('<div class="res m-3">');

                if(req.query.q)
                    req.printf('<div class="m-5 mb-0">Results %d-%d of about %d</div>',
                        skip+1,(skip+nres>icount)?icount:skip+nres,icount
                    );
                else
                    req.printf('<div class="m-5 mb-0">Latest Articles</div>');

                req.printf('<div class="row row-cols-md-3 row-cols-sm-2 row-cols-1 g-4 m-3 mt-0">');
            }

            req.printf('<div class="col"><div class="card">'+
                           '<a target="_blank" href="%s">'+
                             '<img class="card-img-top img-cover" src = "%s">' +
                           '</a>' +
                           '<div class="card-body">'+
                             '<a class="urla tar" target="_blank" href="%s">%s</a>'+
                              '<span class="urlsp">%s</span>'+
                              '<p class="card-text">%s</p>'+
                           '</div>'+
                        '</div></div>',
            res.url, res.img_url, res.url, res.title, res.url, res.Ab); 
        }
    );

    // check if there are more rows.  If so, print a 'next' link.
    if (icount > nres+skip) {
        skip+=nres
        // %U is for url encoding.  See https://rampart.dev/docs/rampart-utils.html#printf
        req.printf('</div><div class="m-3 mt-0">' +
                      '<a class="m-3" href="/apps/pi_news/search.html?q=%U&skip=%d">Next %d</a>' +
                   '<div class="m-3"> </div></div>',
            req.query.q,skip, (nres > icount - skip ? icount - skip: nres)
        );
    }
    endhtml='</div></div></body></html>';


    // send the closing html and set the  mime-type to text/html
    // This is appended to everything already sent using req.printf()
    return({html:endhtml});

    // alternatively, it might be sent like this:
//    req.put(endhtml);
//    return({html:null}); //null means just set the mime-type, but don't append

}

//export the main search function
module.exports=search;

// -fin-
