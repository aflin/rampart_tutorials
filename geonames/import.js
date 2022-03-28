var Sql = require("rampart-sql");

// use process.scriptPath to make sure we have the
// correct path if running from another working directory
var sql = new Sql.init(process.scriptPath + "/web_server/data/geonames_db", true);

// cuz no one likes writing out 'rampart.utils.printf()'
rampart.globalize(rampart.utils);

// put the create statement into its own function
// since we are doing this in stages

function create_table() {

    sql.exec("create table geonames (" +
        "id           counter, "       +
        "country_code char(2), "       +
        "postal_code  varchar(8), "    +
        "place_name   varchar(16), "   +
        "admin_name1  varchar(16), "   +
        "admin_code1  varchar(8), "    +
        "admin_name2  varchar(16), "   +
        "admin_code2  varchar(8), "    +
        "admin_name3  varchar(16), "   +
        "admin_code3  varchar(8), "    +
        "latitude     double, "        +
        "longitude    double, "        +
        "geocode      long, "          +
        "accuracy     int           );"
    );

}


var step = 100; //set in importCsvFile(), only report every 100th row
var total = -1; //we won't know the total until we finish the first pass

/* a single function to monitor the import for both pre-processing (progressFunc)
   and import (callback function supplied to sql.importCsvFile as a paramater)   */
function monitor_import(count, stg) {
    var stage = "Import";

    if(count==0)
        printf("\n");

    if(stg!==undefined) { // progressfunc
        stage=stg;
    }

    if(stg === 0) //differentiate between 0 and undefined
    {
        total=count; //update our total in the first stage.
        printf("Stage: %s, Count: %d       \r", stage, count);
    } else {
        printf("Stage: %s, Count: %d of %d      \r", stage, count, total);
    }
    fflush(stdout);

}

function import_data() {
    total = sql.importCsvFile(
        "allCountries.txt",  //file to import
        {
            normalize:       false,
            singleQuoteNest: false,
            delimiter:       '\t',
            hasHeaderRow:    false,
            tableName:       "geonames",
            callbackStep:    step, //callback run every 100th row
            progressStep:    step, //progressfunc run every 100th row for each stage
            progressFunc:    monitor_import //progress function while processing csv 
        },
        /* numbers are column-in positions (-1 means leave blank, or add counter if field type is 'counter')
           position in array is column-out positions  */
        [-1,0,1,2,3,4,5,6,7,8,9,10,-1,11],
        monitor_import //callback function upon actual import
    );
    printf('\n');//end with a newline
}

function make_geocode() {
    printf("Computing geocode column:\n");

    sql.exec("update geonames set geocode = latlon2geocode(latitude, longitude);",
             //monitor our progress with a callback
             function(row,i) {
                 if(! (i%100) ) {
                     printf("%d of %d    \r", i, total);
                     fflush(stdout);
                 }
             }
    );
    printf('\n');//end with a newline
}

function make_geocode_index() {
    printf("creating index on geocode\n");
    sql.exec("create index geonames_geocode_x on geonames(geocode) WITH INDEXMETER 'on';");
}

function make_id_index(){
    printf("creating index on id\n");
    sql.exec("create index geonames_id_x on geonames(id) WITH INDEXMETER 'on';");
}

function make_text_index() {
    printf("creating indexes on location names\n");

    // noiselist as detailed at https://rampart.dev/docs/sql-set.html#noiselist
    // This is not English text and some geographic abbreviations like OR IN DO TO SO and US
    // are also on the noise words list.
    sql.set({ noiseList:[]});

    sql.exec("create fulltext index geonames_textcols_ftx on geonames"+
        "(place_name\\postal_code\\admin_name1\\admin_code1\\country_code\\admin_name2\\admin_code2\\admin_name3\\admin_code3)"+
        " WITH WORDEXPRESSIONS ('[\\alnum\\x80-\\xFF]{2,99}') INDEXMETER 'on';");
}

create_table();

/* use a manual lock to speed things up.
   Normally Texis locks for each insert.
   However since this script is the only
   process using the "geonames" table,
   we can dispense with the extra work.
*/
sql.exec("lock tables geonames write;");

import_data();
make_geocode();
make_geocode_index();
make_id_index();
make_text_index();

sql.exec("unlock tables;");

printf("All Done\n");

