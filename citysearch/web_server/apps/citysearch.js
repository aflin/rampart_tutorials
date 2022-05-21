rampart.globalize(rampart.utils);
// Load the sql module
var Sql=require("rampart-sql");

var db_location,csvFile;

//assume this script is in 'web_server/apps' and our db will be 'web_server/data/cities'
if(module && module.exports) {
    // preferred way is to have serverConf.dataRoot set in web_server_conf.js
    if( global.serverConf && serverConf.dataRoot) {
        db_location = serverConf.dataRoot + "/cities"   // Change this to your preferred location 
    } else {
        var relativePath="/web_server/";
        var sourcePath = module.id.substring( 0, module.id.indexOf(relativePath) + relativePath.length );
        db_location = sourcePath + "data/cities";
    }
} else {
    var dataRoot = realPath(process.scriptPath+ "/../data");
    if( stat(dataRoot) ) {
        db_location = dataRoot + "/cities";
        csvFile     = dataRoot + "/geonames-all-cities-with-a-population-1000.csv";
    } else {
        fprintf(
          stderr, 
          "Cannot make database.\nPath '%s' does not exits\n",
          dataRoot
        );
        process.exit(1);
    }
}

// csv file is from https://public.opendatasoft.com/explore/dataset/geonames-all-cities-with-a-population-1000/export/

var sql = new Sql.init(db_location, true);

/* ********************* Import Data Section ************************ */

function import_data(){

    function create_tmp_table() {
        try {
            sql.exec("drop table cities_tmp");
        } catch(e){}
        sql.exec("create table cities_tmp (" +
                "Geoname_ID              varchar(8), " +
                "Name                    varchar(8), " +
                "ASCII_Name              varchar(8), " +
                "Alternate_Names         varchar(8), " +
                "Feature_Class           varchar(8), " +
                "Feature_Code            varchar(8), " +
                "Country_Code            varchar(8), " +
                "Country_name_EN         varchar(8), " +
                "Country_Code_2          varchar(8), " +
                "Admin1_Code             varchar(8), " +
                "Admin2_Code             varchar(8), " +
                "Admin3_Code             varchar(8), " +
                "Admin4_Code             varchar(8), " +
                "Population              int, "        +
                "Elevation               int, "        +
                "Digital_Elevation_Model int, "        +
                "Timezone                varchar(8), " +
                "Modification_date       varchar(8), " +
                "LABEL_EN                varchar(8), " +
                "Coordinates             varchar(8)"   +
                ");"  ); 
    }

    var total=-1; //we won't know the total until we finish the first pass of importCsvFile
    var step = 100; //set in importCsvFile(), only report every 100th row

    /* a single function to monitor the import for both pre-processing (progressFunc)
       and import (callback function supplied to sql.importCsvFile as a paramater)   */
    function monitor_import(count, stg) {
        var stage = "Import";

        if(count==0)
            printf("\n");

        if(stg!==undefined) // progressfunc
            stage=stg;

        if(stg === 0) //differentiate between 0 and undefined
        {
            total=count; //update our total in the first stage.
            printf("Stage: %s, Count: %d       \r", stage, count);
        } else {
            printf("Stage: %s, Count: %d of %d      \r", stage, count, total);
        }
        fflush(stdout);
    }

    function import_csv() {
        total = sql.importCsvFile(
            csvFile,  //file to import
            {
                tableName:       'cities_tmp',
                singleQuoteNest: false,
                delimiter:       ';',
                normalize:       false,
                callbackStep:    step, //callback run every 100th row
                progressStep:    step, //progressfunc run every 100th row for each stage
                progressFunc:    monitor_import //progress function while processing csv 
            },
            monitor_import //callback function upon actual import
        );
        printf('\n%d rows in total.\n',total);
    }

    function create_final_table() {
        try {
            sql.exec("drop table cities");
        } catch(e){}
        sql.exec("create table cities (" +
                "id                      counter, "    +
                "place                   varchar(8), " +
                "alt_names               varchar(8), " +
                "population              int, "        +
                "latitude                double, "     +
                "longitude    		 double, "     +
                "geocode      		 long, "       +
                "timezone                varchar(8), " +
                "country                 varchar(8) "  +
                ");"  ); 
    }

    function makerow(o) {
        var ret={}, tmp;

        ret.place = sprintf('%s, %s %s(%s)', o.Name, o.Admin1_Code, o.Country_name_EN, o.Country_Code);
        ret.altNames = o.Alternate_Names;
        ret.population = o.Population;
        tmp = o.Coordinates.split(',');
        ret.lat = parseFloat(tmp[0]);
        ret.lon = parseFloat(tmp[1]);
        ret.tz = o.Timezone;
        ret.country = o.Country_name_EN;
        return ret;
    }

    function build_final_table() {
        printf("sorting rows\n");
        sql.exec("select * from cities_tmp order by Population DESC",
            function(res,i) {

                if(!i) printf("done\nCreating Final Table\n");

                var vals = makerow(res);
                sql.exec("insert into cities values( " +
                    "counter, ?place, ?altNames, ?population, ?lat, ?lon, latlon2geocode(?lat, ?lon), ?tz, ?country );",
                    vals );
                if (! (i % 100) ) {
                    printf("%d of %d\r", i, total);
                    fflush(stdout);
                }
            },
            {maxRows:-1}
        );
        printf('\n');
    }

    function make_geocode_index() {
        printf("creating index on geocode\n");
        sql.exec("create index cities_geocode_x on cities(geocode) WITH INDEXMETER 'on';");
    }

    function make_id_index(){
        printf("creating index on id\n");
        sql.exec("create index cities_id_x on cities(id) WITH INDEXMETER 'on';");
    }

    function make_text_indexes() {
        printf("creating indexes on place names\n");

        // noiselist as detailed at https://rampart.dev/docs/sql-set.html#noiselist
        // This is not English text and some geographic abbreviations like OR IN DO TO SO and US
        // are also on the noise words list.  Setting to empty will allow such words in the index.
        sql.set({ noiseList:[]});

        // make compact index.  Sorting by population, not by likep rank.  See like3 search below.
        sql.exec("create fulltext index cities_place_ftx on cities(place)"+
            " WITH WORDEXPRESSIONS ('[\\alnum\\x80-\\xFF]{2,99}') INDEXMETER 'on' WORDPOSITIONS 'off';");

        sql.exec("create fulltext index cities_altNames_ftx on cities(alt_names)"+
            " WITH WORDEXPRESSIONS ('[\\alnum\\x80-\\xFF]{2,99}') INDEXMETER 'on' WORDPOSITIONS 'off';");
    }

    function drop_tmp_table() {
        sql.exec("drop table cities_tmp");
    }

    create_tmp_table();
    import_csv();
    create_final_table();
    build_final_table();
    make_geocode_index();
    make_id_index();
    make_text_indexes();
    drop_tmp_table();
}


/* ********************* Web App Section ************************ */

var useKilometers=true;

var distvar = "miles";

if(useKilometers)
    distvar = "kilometers";

// the autocomplete plugin from  https://github.com/devbridge/jQuery-Autocomplete
// jquery and plugin included from cloudflare in <script src="xyz"> tags below in pageTopFmt.
var client_script = `
$(document).ready(function(){
    $('#cstextbox').autocomplete(
        {
            serviceUrl: '/apps/citysearch/autocomp.json',
            minChars: 2,
            autoSelectFirst: true,
            showNoSuggestionNotice: true,
            triggerSelectOnValidInput: false,
            onSelect: function(sel) { window.location.assign("./?id="+sel.id); }
        }
    );

    $('#cstextbox').on('keypress', function(e){
        var key = e.charCode || e.keyCode || 0;
        if (key == 13) {       // on <return> don't submit form
            e.preventDefault();
            return false;
        }
    });
});
`;

// pageTopFmt is defined once upon script load here rather than upon each request in 
// htmlpage() below. format code %w removes leading white space.
var pageTopFmt=sprintf('%w',`<!DOCTYPE HTML>
<html>
    <head><meta charset="utf-8">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.5.1/jquery.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jquery.devbridge-autocomplete/1.4.11/jquery.autocomplete.min.js"></script>
    <style>
        body,h1,h2,h3,h4,h5,h6 {font-family: "Varela Round", Sans-Serif;}
        .autocomplete-suggestions {border: 1px solid #999; background: #FFF; overflow: auto; width: auto !important; padding-right:5px;}
        .autocomplete-suggestion { padding: 2px 5px; white-space: nowrap; overflow: hidden; }
        .autocomplete-suggestions strong {font-weight: normal; color: #3399FF; }
        .autocomplete-group strong { display: block; border-bottom: 1px solid #000; }
        .autocomplete-selected { background: #F0F0F0; }
        .autocomplete-group { padding: 2px 5px; }
        #main {background-color: white;margin: auto;min-height: 300px;width: 600px;}
        #idiv { width:500px;height:39px;border-bottom: lightGray 1px solid;padding:15px 0px 15px 0px;}
        #cstextbox {min-width:150px;width:100%%;height:30px;font:normal 18px arial,sans-serif;padding: 1px 3px;border: 2px solid #ccc;box-sizing: border-box;}
    </style>
    <title>City Search Tutorial</title>
    </head>
    <body>
    <div id="main">
      <form id="mf">
          <div id="idiv">
              <input type="text" id="cstextbox" name="q" value="%s" placeholder="Search for a city">
          </div>
      </form>
      <div id="res">`);

var pageBottom = sprintf(`</div></body><script>
%w
</script></html>`, client_script);

var distconv = 1;
if(useKilometers)
    distconv=1.60934

function htmlpage(req) {
    var id = req.params.id, lat, lon;
//req.printf('<!-- %s -->\n',id);
    if(id){
        id_res= sql.one("SELECT place, latitude, longitude " + 
            "FROM cities WHERE id=?;",
            [req.params.id]
        );
        if(id_res) {
            lon=id_res.longitude;
            lat=id_res.latitude;
        }
    } else {
        req.printf(pageTopFmt,'');
        return({html:pageBottom});
    } 

    if(!lon || !lat) {
        req.printf(pageTopFmt,'');
        req.printf('No entry for id "%s".', id);
        return({html:pageBottom});
    }

    res = sql.exec(`SELECT
        place, id, latitude, longitude, population,
        DISTLATLON(?lat, ?lon, latitude, longitude) dist,
        AZIMUTH2COMPASS( AZIMUTHLATLON(?lat, ?lon, latitude, longitude), 3 ) heading
        FROM cities WHERE geocode BETWEEN (SELECT LATLON2GEOCODEAREA(?lat, ?lon, 1.0))
        ORDER BY 6 ASC;`,
        {lat:lat, lon:lon},
        {maxRows: 31}, // first row is same city
        function(res, i) {
            if(!i) {
                req.printf(pageTopFmt,res.place);
                req.printf('<h3 style="margin-bottom:0px">%s</h3><ul style="margin-top:0px">',res.place);
            } else {
                req.printf('<a href="?id=%s">%s</a><br><ul>' +
                    '<li>Direction:  %.2f %s to the %s</li>',
                    res.id, res.place, res.dist * distconv, distvar, res.heading);
            }
            req.printf("<li>Population: %s</li>" +
                '<li>Location: <a target="_blank" href="https://maps.google.com/maps?z=11&q=%U&ll=%f,%f">' +
                'google maps (%.4f,%.4f)</a></li></ul>',
                Sql.stringFormat('%ki', res.population), res.place, res.latitude, res.longitude , res.latitude, res.longitude);
            
            if(!i) req.put('<hr><h3>Closest Cities:</h3>');
        }
    );
    return {html:pageBottom}; //pageBottom is added to same buffer as is used with req.printf()
}

// For autocomp. This needs to be set only once
sql.set({
    noiseList      : [],    // allow search for 'the', 'us', 'or', etc.
    'qMaxWords'    : 5000,  // allow query and sets to be larger than normal for '*' wildcard searches
    'qMaxSetWords' : 5000   // see https://rampart.dev/docs/sql-set.html#qmaxsetwords 
                            // and https://rampart.dev/docs/sql-set.html#qmaxwords .
});

/* autocomp() results must be formatted as such:
{
    "suggestions": [
        {"value":"Vaulion, Canton de Vaud, CH","id":"6233eaf65bd","latitude":46.6848,"longitude":6.3832, ...},
        {"value":"Vallorbe, Canton de Vaud, CH","id":"6233eaf65c6","latitude":46.7078,"longitude":6.3714, ...},
        ...
    ]
}
*/

function autocomp(req) {
    var res;
    var q = req.query.query;

    // remove any spaces at the beginning of q
    q = q.replace(/^\s+/, '');

    // if query is only one char, return an empty set
    //   (even though client-side autocomplete is set to 2 char min)
    if(q.length<2)
        return {json: { "suggestions": []}}

    // we will need at least two chars in our last word since it will get a '*' wildcard added to it
    q = q.replace(/ \S$/, ' ');

    // if last character is not a space, add wildcard
    if(q.charAt(q.length-1) != ' ')
        q += '*';
    
    // perform a like3 (no rank) sorted by pop text search, and return a list of best matching locations
    res = sql.exec("SELECT place value, id, latitude, longitude, population FROM cities WHERE "+
                    "place LIKE3 ? order by population DESC;", [q] );

    //if no results, try again using alt_names
    if(res.rowCount == 0) {
        res = sql.exec("SELECT place value, alt_names,id, latitude, longitude, population FROM cities WHERE " +
                        "alt_names LIKE3 ? order by population DESC;", [q] );
        // add alt name to "value" for type ahead display
        for (var i=0; i<res.rows.length;i++) {
            var row = res.rows[i];
            var ql = req.query.query.toLowerCase();
            var anames = row.alt_names.split(',');
            for (var j=0; j<anames.length;j++) {
                var aname = anames[j].toLowerCase();
                if(aname.indexOf(ql) > -1) {
                    row.value += ' (aka: ' +  aname + ')';
                    break;
                }
            }
        }
    }
    return {json: { "suggestions": res.rows}};
}

if(module && module.exports) {
    // url to function mapping
    module.exports= {
        "/":               htmlpage,  //http://localhost:8088/apps/citysearch/
        "/index.html":     htmlpage,  //http://localhost:8088/apps/citysearch/index.html
        "/autocomp.json":  autocomp,  //http://localhost:8088/apps/citysearch/autocomp.json
    }
} else {
    import_data();
}
