var Sql=require("rampart-sql");
var sql=new Sql.init(serverConf.dataRoot + '/geonames_db');

var useKilometers=true;

var distvar = "mi"

if(useKilometers)
    distvar = "km"

//defining page once upon script load.
var page=`<!DOCTYPE HTML>
        <html><head><meta charset="utf-8">
        <script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.5.1/jquery.min.js"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/jquery.devbridge-autocomplete/1.4.11/jquery.autocomplete.min.js"></script>
        <style>
            body,h1,h2,h3,h4,h5,h6 {font-family: "Varela Round", Sans-Serif;}
            .autocomplete-suggestions { border: 1px solid #999; background: #FFF; overflow: auto; width: auto !important; padding-right:5px;}
            .autocomplete-suggestion { padding: 2px 5px; white-space: nowrap; overflow: hidden; }
            .autocomplete-selected { background: #F0F0F0; }
            .autocomplete-suggestions strong { font-weight: normal; color: #3399FF; }
            .autocomplete-group { padding: 2px 5px; }
            .autocomplete-group strong { display: block; border-bottom: 1px solid #000; }
        </style>
        <title>City Search Tutorial</title>
        </head>
        <body>
        <div id="main" style="padding-bottom:30px;background-color: white; position: absolute; left:200px; top:0px; min-height: 300px; overflow-x: hidden; padding-right: 20px; padding-left: 30px; box-sizing: border-box; width: 600px;">
          <form id="mf">
            <div style="width:100%">
              <span style="white-space:nowrap;display:block;width:500px;height:39px;position:relative;background-color: white;z-index:10;border-bottom: lightGray 1px solid; padding-top:15px;padding-bottom:15px">
                <table style="background-color: white; width:100%">
                  <tr>
                    <td style="position:relative">
                      <input type="text" id="cstextbox" name="q" value="" placeholder="Search for a city" style="box-sizing:border-box;min-width:150px;width:100%;height:30px;font:normal 18px arial,sans-serif;padding: 1px 3px;border: 2px solid #ccc;">
                    </td>
                  </tr>
                </table>
              </span>
            </div> 
          </form>
          <div id="res"></div>
          </body>
          <script>

// function to get query parameters from url
function getparams() {
    if (window.location.search.length==0)
        return {};

    var qstr  = window.location.search.substring(1);
    var pairs = qstr.split('&');
    var ret = {}, i=0;

    for (i = 0; i < pairs.length; i++) {
        var kv = pairs[i].split('=');
        ret[kv[0]]=kv[1];
    }
    return ret;
};

$(document).ready(function(){

    var curzip, curid;
    var params = getparams();

    // format the results, stick them in the div below the search form
    // update url to match state if curid is set
    function format_res(res) {
        var resdiv = $('#res');
        var places = Object.keys(res);
        var reshtml="<h2>Closest places to " + $('#cstextbox').val() +'</h2>';;
        resdiv.html('');

        for (var i=0;i<places.length;i++) {
            var j=0, place=places[i];
            var placeObj = res[place];
            var zkeys = Object.keys(placeObj);
            var ziphtml='';
            var is_self=false; //flag if we are processing zip codes in the current city          

            for(j=0;j<zkeys.length;j++) {
                var zip=zkeys[j];
                if(zip == 'avgdist')
                    continue;
                if(zip == curzip ) {
                    is_self=true;
                    continue;
                }
                var zipObj = placeObj[zip];
                //console.log(zipObj);
                ziphtml+='<a class="zip" href="#" data-zip="' + zip + '" data-lat="' + zipObj.lat + '" data-lon="' +
                         zipObj.lon + '" data-id="' + zipObj.id + '">' + zip + '(' + zipObj.dist.toFixed(1) +
                         ' ' + zipObj.heading + ')</a> ';
            }
            if(ziphtml) {// skip self if only one zip.
                if(is_self)
                    reshtml += '<span><h3>Other zip codes in <span class="place">' + place + '</span></h3>'  
                            + ziphtml + "</span>";
                else
                    reshtml += '<span><h3><span class="place">' + place + '</span> ('+ parseFloat(placeObj.avgdist).toFixed(1)  +' ${distvar}.)</h3>'  
                            + ziphtml + "</span>";
            }
        }
        resdiv.html(reshtml);

        if(curid){
            var nurl = window.location.origin + window.location.pathname + '?id=' + curid;
            window.history.pushState({},'',nurl);
        }
    }

    // Use 'body' and filter with class 'zip' so the event will pick up not yet written content
    $('body').on('click','.zip',function(e) {
        //perform a new search on the zip code that was clicked.
        var t = $(this);
        var lat = t.attr('data-lat'), 
            lon=t.attr('data-lon'),
            zip=t.attr('data-zip');
        var place = t.closest('span').find('.place').text();

        //curid is for the change of url in order to save the state.
        curid = t.attr('data-id');

        // recreate the place name with the zip code in it
        place = place.substring(0, place.length-2) +zip + ', ' + place.substring(place.length-2, place.length);
        // put it in the search box
        $('#cstextbox').val(place);

        // fetch new list of closest cities and display
        $.getJSON(
            "/apps/citysearch/ajaxres.json",
            {lat:lat, lon: lon},
            function(res) {
                curzip=zip;
                format_res(res);
            }
        );
        return false; //don't actually go to the href in the clicked <a>
    });

    // the autocomplete plugin from  https://github.com/devbridge/jQuery-Autocomplete
    // jquery and plugin included from cloudflare in <script src="xyz"> tags above.
    $('#cstextbox').autocomplete(
        {
            serviceUrl: '/apps/citysearch/autocomp.json',
            minChars: 2,
            autoSelectFirst: true,
            showNoSuggestionNotice: true,
            onSelect: function(sel)
            {
                $.getJSON(
                    "/apps/citysearch/ajaxres.json",
                    {lat:sel.latitude, lon: sel.longitude},
                    function(res) {
                        curzip = sel.zip;
                        curid = sel.id;
                        format_res(res);
                    }
                );
            }
        }
    );

    // prevent form submission - all results are already in the autocomplete
    $('#cstextbox').on('keypress', function(e){
        var key = e.charCode || e.keyCode || 0;
        if (key == 13) {
            e.preventDefault();
            return false;
        }
    });

    function refresh(id) {
        $.getJSON(
            "/apps/citysearch/ajaxres.json",
            {id:params.id},
            function(res) {
                curzip = res.zip;
                $('#cstextbox').val(res.place);
                //no curid necessary here
                format_res(res.res);
            }
        );
    }
    // if we refresh the page, then reload the content
    if(params.id) {
        refresh(params.id);
    }
    
    window.onpopstate = function(event) {
        // url has changed, but page was not reloaded
        params = getparams();
        curid=false;
        if(params.id)
            refresh(params.id);
        else {
            $('#cstextbox').val('');
            $('#res').html('');
        }
    };

});
           </script>
          </html>`;



function htmlpage(req) {
    // just return the html.
    return {html:page}
}


var distconv = 1;

if(useKilometers)
    distconv=1.60934

// reorganize our data for easy handling client side.
function reorg_places(places) {
    var i=0, j=0, ret={};
    /* group by city, with entries for distance for each zip code */
    for (; i<places.length;i++) {
        var p = places[i];
        if(!ret[p.place])
            ret[p.place]={};
        ret[p.place][p.postal_code] = {
            dist: p.dist * distconv,
            lon: p.longitude,
            lat: p.latitude,
            id: p.id,
            heading: p.heading
        };
    } 
    // calc average distance
    var keys = Object.keys(ret);
    for (i=0;i<keys.length;i++) {
        var placeName = keys[i];
        var placeObj = ret[placeName];
        var zkeys = Object.keys(placeObj);
        var cnt=0, avg=0;
        for (j=0;j<zkeys.length;j++) {
            var zkey = zkeys[j];
            avg += placeObj[zkey].dist;
            cnt++;
//avg = avg + `${zkey}[ = ${placeObj[zkey]}`;
        }
        avg /= cnt;
        placeObj.avgdist=avg;
    }

/* ret will be something like:
{
    "Rocklin, California, US":
    {
        "95677":{"dist":0,"lon":-121.2366,"lat":38.7877,"id":"6232be7e18b","heading":"N"},
        "95765":{"dist":3.9415328848914677,"lon":-121.2677,"lat":38.8136,"id":"6232be7e1b2","heading":"NW"},
        "avgdist":1.9707664424457338
    },
    "Roseville, California, US":{
        "95661":{"dist":5.904624610176184,"lon":-121.234,"lat":38.7346,"id":"6232be7e185","heading":"S"},
        "95678":{"dist":5.2635315744972475,"lon":-121.2867,"lat":38.7609,"id":"6232be7e18e","heading":"SW"},
        "95747":{"dist":8.926222554334897,"lon":-121.3372,"lat":38.7703,"id":"6232be7e1af","heading":"WSW"},
        "avgdist":6.698126246336109
    },
    ...
}
*/
    return ret;
}

function ajaxres(req) {
    var res, res2;
    var lon = req.params.lon, lat=req.params.lat;

    // if we are given an id, look up the lat/lon
    if(req.params.id)
    {
        res2= sql.one("SELECT " +
            "place_name +', ' + admin_name1 + ', ' + postal_code + ', ' +country_code place, "  +
            "postal_code zip, latitude lat, longitude lon " + 
            "FROM geonames WHERE id=?;",
            [req.params.id]
        );
        if(res2) {
            lon=res2.lon;
            lat=res2.lat;
        }
    }

    if(!lon || !lat)
        return {json:{}};

    res = sql.exec("SELECT " +
        "place_name +', ' + admin_name1 + ', ' + country_code place, "  +
        "id, postal_code, latitude, longitude, DISTLATLON(?, ?, latitude, longitude) dist, " + 
        "AZIMUTH2COMPASS( AZIMUTHLATLON(?, ?, latitude, longitude), 3 ) heading " +
        "FROM geonames WHERE geocode BETWEEN (SELECT LATLON2GEOCODEAREA(?, ?, 1.0)) ORDER BY 6 ASC;",
        [lat,lon,lat,lon,lat,lon],
        {maxRows: 100 }
    );
    var ret = reorg_places(res.rows);

    if(req.params.id)
        ret = {res:ret, place:res2.place, zip:res2.zip}

    return {json:ret}
}

function autocomp(req) {
    var res;
    var q = req.query.query;

    // ignore one character partial words

    // remove any spaces at the beginning of q
    q = q.replace(/^\s+/, '');

    // if query is only one char, return an empty set
    //   (even though client-side autocomplete is set to 2 char min)
    if(q.length<2)
        return {json: { "suggestions": []}}

    // we will need at least two chars
    q = q.replace(/ \S$/, ' ');
    

    // if last character is not a space, add glob    
    if(q.charAt(q.length-1) != ' ')
        q += '*';

    sql.set({
        'likepAllmatch': true,  //match every word or partial word
        'qMaxWords'    : 5000,  //allow query and sets to be larger than normal for '*' glob/wildcard searches
        'qMaxSetWords' : 5000
    });
    
    // perform a text search on the words or partial words we have, and return a list of best matching locations
    res = sql.exec("SELECT " +
        "place_name +', ' + admin_name1 + ', ' + postal_code + ', ' + country_code value, "  +
        "id, latitude, longitude, postal_code zip "+
        "FROM geonames WHERE " +
        "place_name\\postal_code\\admin_name1\\admin_code1\\country_code\\admin_name2\\admin_code2\\admin_name3\\admin_code3 "+
        "LIKEP ?",
        [q] 
    );
    return {json: { "suggestions": res.rows}};
}

// url to function mapping
module.exports= {
    "/":               htmlpage,  //http://localhost:8088/apps/citysearch/
    "/index.html":     htmlpage,  //http://localhost:8088/apps/citysearch/index.html
    "/autocomp.json":  autocomp,  //http://localhost:8088/apps/citysearch/autocomp.json
    "/ajaxres.json":   ajaxres    //http://localhost:8088/apps/citysearch/ajaxres.json
}

