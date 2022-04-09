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
    <html><head><meta charset="utf-8">
    <style>
        body {font-family: arial,sans-serif;}
        td {position:relative;}
        #showrm {position:relative;}
        .itemwrap{ width: calc( 100%% - 70px); position: relative;display: inline-block;}
        .imgwrap {width:100%%;float: left; display:inline-block;position:relative;padding-top:5px;}
        .abs { margin-right:5px;white-space: normal;}
        .urlsp {color:#006621;max-width:100%%;overflow: hidden;text-overflow: ellipsis;white-space:nowrap;display:inline-block;font-size:.90em;}
        .urla {text-decoration: none;font-size:16px;overflow: hidden;text-overflow: ellipsis;white-space:nowrap;display:inline-block; width: 100%%; }
        .res {margin-top: 80px;}
        .resi {min-height:20px;position:relative;clear:both;padding-top: 15px;}
        .nw { white-space:nowrap;}
        .ico { float:left;margin-right:5px}
    </style>
    </head><body>
    <div id="lc" style="background-color: white; position: fixed; left:0px; top:20px; min-height: 300px; overflow-x: hidden; padding-right: 20px; padding-left: 20px; box-sizing: border-box; width: 200px;">
     <div style="width:180px;height:128px;margin-bottom:15px">
      【Ｒａｍｐａｒｔ】</div>
    </div>
    <div id="main" style="padding-bottom:30px;background-color: white; position: absolute; left:200px; top:0px; min-height: 300px; overflow-x: hidden; padding-right: 20px; padding-left: 30px; box-sizing: border-box; width: 600px;">
      <form id="mf" action="/apps/pi_news/search.html">
        <div style="width:100%%">
          <span style="white-space:nowrap;display:block;width:500px;height:39px;position:fixed;background-color: white;z-index:10;border-bottom: lightGray 1px solid; padding-top:15px;padding-bottom:15px">
            <table style="background-color: white; width:100%%">
              <tr>
                <td style="position:relative">
                  <input autocomplete="off" type="text" id="fq" name="q" value="%H" placeholder="Search" style="box-sizing:border-box;min-width:150px;width:100%%;height:30px;font:normal 18px arial,sans-serif;padding: 1px 3px;border: 2px solid #ccc;">
                  <input type=submit id="search" style="height:22px;position: absolute; right: 0px;margin: 4px;" value="Search">
                </td>
              </tr>
            </table>
          </span>
        </div>
      </form>
      <div class="res">`
);



function search(req) {
    var q=req.query.q ? req.query.q: "";

    // req.query.skip in, e.g. "/apps/pi_news/search.html?q=pi&skip=10" is text.
    // Make it a JavaScript number.
    var skip=parseInt( req.query.skip );

    var icount=0;  //estimated total number of results, set below
    var endhtml;   // closing tags, set below
    var nres=10;   // number of results per page

    // add the htmltop text to the server's output buffer.
    // See: https://rampart.dev/docs/rampart-server.html#req-printf
    // it includes escaped '%%' values and the 'value="%H"' format code for the query
    req.printf(htmltop_format, q);

    if (!skip)skip=0;

    
    // if there is a query, search for it and format the results.
    // if not, just send the endhtml.
    if(req.query.q) {
        // by default, only the first 100 rows are returned for any likep search.
        // if we are skipping past that, we need to raise the likeprows setting.
        if(skip + nres > 100 )
            sql.set({likeprows:skip + nres});
        else
            sql.set({likeprows:100}); //reset to default in case previously set
        // sql.exec(statement, params, settings, callback);
        sql.exec(
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
            "select url, img_url, title, stringformat('%mbH','@0 '+?query,abstract(text, 0,'querymultiple',?query)) Ab from pipages where text likep ?query",

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

                //the first row
                if(i==skip) {
                    icount=parseInt(info.indexCount);
                    req.printf('<div class="info">Results %d-%d of about %d</div>',skip+1,(skip+nres>icount)?icount:skip+nres,icount);
                }

                // format each row and add to the HTML in the server buffer to be sent to client
                req.printf('<div class="resi" style="padding-top: 15px;">'+
                                '<span class="imgwrap">'+
                                '<span class="itemwrap">'+
                                    '<span class="abs nw">'+
                                      '<a class="urla tar" target="_blank" href="%s">%s</a>'+
                                    '</span>'+
                                    '<span class="abs urlsp snip">%s</span>'+
                                    '<br><span class="abs snip">'+
                                      '<img class="ico" src = "%s" style="width:100px">' +
                                    '%s</span>'+
                              '</span></span></div>',
                res.url, res.title, res.url, res.img_url, res.Ab); 
            }
        );
    }

    // check if there are more rows.  If so, print a 'next' link.
    if (icount > nres+skip) {
        skip+=nres
        // %U is for url encoding.  See https://rampart.dev/docs/rampart-utils.html#printf
        endhtml=sprintf('</div><br><div style="text-align:right;padding-top: 12px;width: 450px;clear: both;"><a href="/apps/pi_news/search.html?q=%U&skip=%d">Next %d</a></div></body></html>',req.query.q,skip,nres);
    } else {
        endhtml='</div></div></body></html>';
    }

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
