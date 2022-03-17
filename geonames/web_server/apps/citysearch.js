var Sql=require("rampart-sql");
var sql=new Sql.init(serverConf.dataRoot + '/geonames_db');

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
                      <input type="text" id="cstextbox" name="q" value="" placeholder="Search" style="box-sizing:border-box;min-width:150px;width:100%;height:30px;font:normal 18px arial,sans-serif;padding: 1px 3px;border: 2px solid #ccc;">
                      <input type=image id="search" style="height:22px;position: absolute; right: 0px;margin: 4px;" src="data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiIHN0YW5kYWxvbmU9Im5vIj8+CjxzdmcKICAgeG1sbnM6ZGM9Imh0dHA6Ly9wdXJsLm9yZy9kYy9lbGVtZW50cy8xLjEvIgogICB4bWxuczpjYz0iaHR0cDovL2NyZWF0aXZlY29tbW9ucy5vcmcvbnMjIgogICB4bWxuczpyZGY9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMiCiAgIHhtbG5zOnN2Zz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciCiAgIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIKICAgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiCiAgIHZlcnNpb249IjEuMSIKICAgaWQ9InN2ZzQxNTUiCiAgIHZpZXdCb3g9IjAgMCA4MDAuMDAwMDEgODAwLjAwMDAxIgogICBoZWlnaHQ9IjgwMCIKICAgd2lkdGg9IjgwMCI+CiAgPGRlZnMKICAgICBpZD0iZGVmczQxNTciPgogICAgPGxpbmVhckdyYWRpZW50CiAgICAgICBpZD0ibGluZWFyR3JhZGllbnQ1NTQ4Ij4KICAgICAgPHN0b3AKICAgICAgICAgaWQ9InN0b3A1NTUwIgogICAgICAgICBvZmZzZXQ9IjAiCiAgICAgICAgIHN0eWxlPSJzdG9wLWNvbG9yOiMwMDAwMDA7c3RvcC1vcGFjaXR5OjAuNCIgLz4KICAgICAgPHN0b3AKICAgICAgICAgaWQ9InN0b3A1NTUyIgogICAgICAgICBvZmZzZXQ9IjEiCiAgICAgICAgIHN0eWxlPSJzdG9wLWNvbG9yOiMwMDAwMDA7c3RvcC1vcGFjaXR5OjA7IiAvPgogICAgPC9saW5lYXJHcmFkaWVudD4KICAgIDxsaW5lYXJHcmFkaWVudAogICAgICAgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiCiAgICAgICB5Mj0iODQ3Ljg1ODA5IgogICAgICAgeDI9Ii02OC4yMzQ5MzIiCiAgICAgICB5MT0iNDE2LjQyOTU3IgogICAgICAgeDE9IjM0OS42NjQ4NiIKICAgICAgIGlkPSJsaW5lYXJHcmFkaWVudDU1NTQiCiAgICAgICB4bGluazpocmVmPSIjbGluZWFyR3JhZGllbnQ1NTQ4IiAvPgogICAgPG1hc2sKICAgICAgIGlkPSJtYXNrNTU1NiIKICAgICAgIG1hc2tVbml0cz0idXNlclNwYWNlT25Vc2UiPgogICAgICA8Y2lyY2xlCiAgICAgICAgIHI9IjQwMCIKICAgICAgICAgY3k9IjY1Mi4zNjIxOCIKICAgICAgICAgY3g9IjQwMCIKICAgICAgICAgaWQ9ImNpcmNsZTU1NTgiCiAgICAgICAgIHN0eWxlPSJjb2xvcjojMDAwMDAwO2NsaXAtcnVsZTpub256ZXJvO2Rpc3BsYXk6aW5saW5lO292ZXJmbG93OnZpc2libGU7dmlzaWJpbGl0eTp2aXNpYmxlO29wYWNpdHk6MTtpc29sYXRpb246YXV0bzttaXgtYmxlbmQtbW9kZTpub3JtYWw7Y29sb3ItaW50ZXJwb2xhdGlvbjpzUkdCO2NvbG9yLWludGVycG9sYXRpb24tZmlsdGVyczpsaW5lYXJSR0I7c29saWQtY29sb3I6IzAwMDAwMDtzb2xpZC1vcGFjaXR5OjE7ZmlsbDojZmZmZmZmO2ZpbGwtb3BhY2l0eToxO2ZpbGwtcnVsZTpub256ZXJvO3N0cm9rZTpub25lO3N0cm9rZS13aWR0aDowLjQwMDAwMDAxO3N0cm9rZS1taXRlcmxpbWl0OjQ7c3Ryb2tlLWRhc2hhcnJheTpub25lO3N0cm9rZS1vcGFjaXR5OjE7Y29sb3ItcmVuZGVyaW5nOmF1dG87aW1hZ2UtcmVuZGVyaW5nOmF1dG87c2hhcGUtcmVuZGVyaW5nOmF1dG87dGV4dC1yZW5kZXJpbmc6YXV0bztlbmFibGUtYmFja2dyb3VuZDphY2N1bXVsYXRlIiAvPgogICAgPC9tYXNrPgogICAgPG1hc2sKICAgICAgIGlkPSJtYXNrNTU2MCIKICAgICAgIG1hc2tVbml0cz0idXNlclNwYWNlT25Vc2UiPgogICAgICA8Y2lyY2xlCiAgICAgICAgIHI9IjQwMCIKICAgICAgICAgY3k9IjQwMC4wMDAwMyIKICAgICAgICAgY3g9IjQwMCIKICAgICAgICAgaWQ9ImNpcmNsZTU1NjIiCiAgICAgICAgIHN0eWxlPSJjb2xvcjojMDAwMDAwO2NsaXAtcnVsZTpub256ZXJvO2Rpc3BsYXk6aW5saW5lO292ZXJmbG93OnZpc2libGU7dmlzaWJpbGl0eTp2aXNpYmxlO29wYWNpdHk6MTtpc29sYXRpb246YXV0bzttaXgtYmxlbmQtbW9kZTpub3JtYWw7Y29sb3ItaW50ZXJwb2xhdGlvbjpzUkdCO2NvbG9yLWludGVycG9sYXRpb24tZmlsdGVyczpsaW5lYXJSR0I7c29saWQtY29sb3I6IzAwMDAwMDtzb2xpZC1vcGFjaXR5OjE7ZmlsbDojZmZmZmZmO2ZpbGwtb3BhY2l0eToxO2ZpbGwtcnVsZTpub256ZXJvO3N0cm9rZTpub25lO3N0cm9rZS13aWR0aDowLjQwMDAwMDAxO3N0cm9rZS1taXRlcmxpbWl0OjQ7c3Ryb2tlLWRhc2hhcnJheTpub25lO3N0cm9rZS1vcGFjaXR5OjE7Y29sb3ItcmVuZGVyaW5nOmF1dG87aW1hZ2UtcmVuZGVyaW5nOmF1dG87c2hhcGUtcmVuZGVyaW5nOmF1dG87dGV4dC1yZW5kZXJpbmc6YXV0bztlbmFibGUtYmFja2dyb3VuZDphY2N1bXVsYXRlIiAvPgogICAgPC9tYXNrPgogIDwvZGVmcz4KICA8bWV0YWRhdGEKICAgICBpZD0ibWV0YWRhdGE0MTYwIj4KICAgIDxyZGY6UkRGPgogICAgICA8Y2M6V29yawogICAgICAgICByZGY6YWJvdXQ9IiI+CiAgICAgICAgPGRjOmZvcm1hdD5pbWFnZS9zdmcreG1sPC9kYzpmb3JtYXQ+CiAgICAgICAgPGRjOnR5cGUKICAgICAgICAgICByZGY6cmVzb3VyY2U9Imh0dHA6Ly9wdXJsLm9yZy9kYy9kY21pdHlwZS9TdGlsbEltYWdlIiAvPgogICAgICAgIDxkYzp0aXRsZT48L2RjOnRpdGxlPgogICAgICA8L2NjOldvcms+CiAgICA8L3JkZjpSREY+CiAgPC9tZXRhZGF0YT4KICA8ZwogICAgIGlkPSJsYXllcjEiCiAgICAgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMCwtMjUyLjM2MjE2KSI+CiAgICA8Y2lyY2xlCiAgICAgICBzdHlsZT0iY29sb3I6IzAwMDAwMDtjbGlwLXJ1bGU6bm9uemVybztkaXNwbGF5OmlubGluZTtvdmVyZmxvdzp2aXNpYmxlO3Zpc2liaWxpdHk6dmlzaWJsZTtvcGFjaXR5OjE7aXNvbGF0aW9uOmF1dG87bWl4LWJsZW5kLW1vZGU6bm9ybWFsO2NvbG9yLWludGVycG9sYXRpb246c1JHQjtjb2xvci1pbnRlcnBvbGF0aW9uLWZpbHRlcnM6bGluZWFyUkdCO3NvbGlkLWNvbG9yOiMwMDAwMDA7c29saWQtb3BhY2l0eToxO2ZpbGw6IzFjOGFkYjtmaWxsLW9wYWNpdHk6MTtmaWxsLXJ1bGU6bm9uemVybztzdHJva2U6bm9uZTtzdHJva2Utd2lkdGg6MC40MDAwMDAwMTtzdHJva2UtbWl0ZXJsaW1pdDo0O3N0cm9rZS1kYXNoYXJyYXk6bm9uZTtzdHJva2Utb3BhY2l0eToxO2NvbG9yLXJlbmRlcmluZzphdXRvO2ltYWdlLXJlbmRlcmluZzphdXRvO3NoYXBlLXJlbmRlcmluZzphdXRvO3RleHQtcmVuZGVyaW5nOmF1dG87ZW5hYmxlLWJhY2tncm91bmQ6YWNjdW11bGF0ZSIKICAgICAgIGlkPSJwYXRoNDcxMiIKICAgICAgIGN4PSI0MDAiCiAgICAgICBjeT0iNjUyLjM2MjE4IgogICAgICAgcj0iNDAwIiAvPgogICAgPHBhdGgKICAgICAgIG1hc2s9InVybCgjbWFzazU1NjApIgogICAgICAgaWQ9InBhdGg0NzMwIgogICAgICAgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMCwyNTIuMzYyMTYpIgogICAgICAgZD0ibSAzNDguMzI2MTcsMTkzLjk1MTE3IGMgLTM5LjUwODU4LDAgLTc5LjAxNTY0LDE1LjA3MTUyIC0xMDkuMTYwMTUsNDUuMjE0ODUgTCAzLjg1MzUyMDQsNDc0LjQ3ODUyIEMgMzMuMTA4MDEyLDY0OC4yOTA1OSAxMTIuNjM4MDIsNzg1Ljc1ODkxIDM2My44ODU0OCw3OTkuMDk0MTQgTCA2MDYuMDUwNzgsNTU2LjkyOTY5IDQ3OS4xMjg5MSw0MzAuMDA3ODEgYyAzOC4wNTIwNiwtNjAuOTA0MjcgMjkuMDgyMzMsLTE0MC4wMDQxIC0yMS42NDA2MywtMTkwLjg0MTc5IC0zMC4xNDQ1MSwtMzAuMTQzMzMgLTY5LjY1MzUzLC00NS4yMTQ4NSAtMTA5LjE2MjExLC00NS4yMTQ4NSB6IgogICAgICAgc3R5bGU9ImNvbG9yOiMwMDAwMDA7Y2xpcC1ydWxlOm5vbnplcm87ZGlzcGxheTppbmxpbmU7b3ZlcmZsb3c6dmlzaWJsZTt2aXNpYmlsaXR5OnZpc2libGU7b3BhY2l0eToxO2lzb2xhdGlvbjphdXRvO21peC1ibGVuZC1tb2RlOm5vcm1hbDtjb2xvci1pbnRlcnBvbGF0aW9uOnNSR0I7Y29sb3ItaW50ZXJwb2xhdGlvbi1maWx0ZXJzOmxpbmVhclJHQjtzb2xpZC1jb2xvcjojMDAwMDAwO3NvbGlkLW9wYWNpdHk6MTtmaWxsOnVybCgjbGluZWFyR3JhZGllbnQ1NTU0KTtmaWxsLW9wYWNpdHk6MTtmaWxsLXJ1bGU6bm9uemVybztzdHJva2U6bm9uZTtzdHJva2Utd2lkdGg6MC40MDAwMDAwMTtzdHJva2UtbWl0ZXJsaW1pdDo0O3N0cm9rZS1kYXNoYXJyYXk6bm9uZTtzdHJva2Utb3BhY2l0eToxO2NvbG9yLXJlbmRlcmluZzphdXRvO2ltYWdlLXJlbmRlcmluZzphdXRvO3NoYXBlLXJlbmRlcmluZzphdXRvO3RleHQtcmVuZGVyaW5nOmF1dG87ZW5hYmxlLWJhY2tncm91bmQ6YWNjdW11bGF0ZSIgLz4KICAgIDxwYXRoCiAgICAgICBtYXNrPSJ1cmwoI21hc2s1NTU2KSIKICAgICAgIGlkPSJjaXJjbGU0MTQ5IgogICAgICAgZD0ibSAyMzkuMTY1MDQsNDkxLjUyNzcgYSAxNTQuMzgwOTcsMTU0LjM4MDk3IDAgMCAwIDAsMjE4LjMyNDI4IDE1NC4zODA5NywxNTQuMzgwOTcgMCAwIDAgMTkwLjg0MTAxLDIxLjY0MDY4IEwgNTU2LjkyNzY3LDg1OC40MTI4NyA2MDYuMDUwNCw4MDkuMjkxNDIgNDc5LjEyODc4LDY4Mi4zNjk2MyBBIDE1NC4zODA5NywxNTQuMzgwOTcgMCAwIDAgNDU3LjQ4ODQsNDkxLjUyNzcgYSAxNTQuMzgwOTcsMTU0LjM4MDk3IDAgMCAwIC0yMTguMzIzMzYsMCB6IG0gMzYuMzk0MjcsMzYuMzk0NTggYSAxMDIuOTIwNjUsMTAyLjkyMDY1IDAgMCAxIDE0NS41MzQ2NiwwIDEwMi45MjA2NSwxMDIuOTIwNjUgMCAwIDEgMCwxNDUuNTM1MTEgMTAyLjkyMDY1LDEwMi45MjA2NSAwIDAgMSAtMTQ1LjUzNDY2LDAgMTAyLjkyMDY1LDEwMi45MjA2NSAwIDAgMSAwLC0xNDUuNTM1MTEgeiIKICAgICAgIHN0eWxlPSJjb2xvcjojMDAwMDAwO2NsaXAtcnVsZTpub256ZXJvO2Rpc3BsYXk6aW5saW5lO292ZXJmbG93OnZpc2libGU7dmlzaWJpbGl0eTp2aXNpYmxlO29wYWNpdHk6MTtpc29sYXRpb246YXV0bzttaXgtYmxlbmQtbW9kZTpub3JtYWw7Y29sb3ItaW50ZXJwb2xhdGlvbjpzUkdCO2NvbG9yLWludGVycG9sYXRpb24tZmlsdGVyczpsaW5lYXJSR0I7c29saWQtY29sb3I6IzAwMDAwMDtzb2xpZC1vcGFjaXR5OjE7ZmlsbDojZmZmZmZmO2ZpbGwtb3BhY2l0eToxO2ZpbGwtcnVsZTpub256ZXJvO3N0cm9rZTpub25lO3N0cm9rZS13aWR0aDowLjQwMDAwMDAxO3N0cm9rZS1taXRlcmxpbWl0OjQ7c3Ryb2tlLWRhc2hhcnJheTpub25lO3N0cm9rZS1vcGFjaXR5OjE7Y29sb3ItcmVuZGVyaW5nOmF1dG87aW1hZ2UtcmVuZGVyaW5nOmF1dG87c2hhcGUtcmVuZGVyaW5nOmF1dG87dGV4dC1yZW5kZXJpbmc6YXV0bztlbmFibGUtYmFja2dyb3VuZDphY2N1bXVsYXRlIiAvPgogIDwvZz4KPC9zdmc+Cg==">
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
    function format_res(res) {
        var resdiv = $('#res');
        var places = Object.keys(res);
        var reshtml='';
        resdiv.html('');
        
        for (var i=0;i<places.length;i++) {
            var j=0, place=places[i];
            var placeObj = res[place];
            var zkeys = Object.keys(placeObj);
            var ziphtml="";
            
            for(j=0;j<zkeys.length;j++) {
                var zip=zkeys[j];
                if(zip == 'avgdist' || zip == curzip )
                    continue;
                var zipObj = placeObj[zip];
                //console.log(zipObj);
                ziphtml+='<a class="zip" href="#" data-zip="' + zip + '" data-lat="' + zipObj.lat + '" data-lon="' +
                         zipObj.lon + '" data-id="' + zipObj.id + '">' + zip + '(' + zipObj.dist.toFixed(1) +
                         ')</a> ';
            }
            if(ziphtml) {// skip self if only one zip.
                reshtml += '<span><h3><span class="place">' + place + '</span> ('+ parseFloat(placeObj.avgdist).toFixed(1)  +' miles)</h3>'  
                        + ziphtml + "</span>";
            }
        }
        resdiv.html(reshtml);

        if(curid){
            var nurl = window.location.origin + window.location.pathname + '?id=' + curid;
            window.history.pushState({},'',nurl);
        }
    }

    // Use 'body' and filter with class 'zip' so the event will pick up dynamic content
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
            noCache: true,
            onSelect: function(sel)
            {
                $.getJSON(
                    "/apps/citysearch/ajaxres.json",
                    {lat:sel.latitude, lon: sel.longitude},
                    function(res) {
                        curzip = sel.zip;
                        format_res(res);
                    }
                );
            }
        }
    );

    // if we refresh the page, then reload the content
    if(params.id) {
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

});
           </script>
          </html>`;



function htmlpage(req) {
    // just return the html.
    return {html:page}
}

// reorganize our data for easy handling client side.
function reorg_places(places) {
    var i=0, j=0, ret={};
    /* group by city, with entries for distance for each zip code */
    for (; i<places.length;i++) {
        var p = places[i];
        if(!ret[p.place])
            ret[p.place]={};
        ret[p.place][p.postal_code] = {
            dist: p.dist,
            lon: p.longitude,
            lat: p.latitude,
            id: p.id
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
    "Roseville, California, US":
        {
            "95661":{"dist":6.079011946734402,"lon":-121.234,"lat":38.7346,"id":"6232be7e185"},
            "95678":{"dist":2.795090721864372,"lon":-121.2867,"lat":38.7609,"id":"6232be7e18e"},
            "95747":{"dist":0,"lon":-121.3372,"lat":38.7703,"id":"6232be7e1af"},
            "avgdist":2.958034222866258
        },
    "Antelope, California, US":
        {
            "95843":{"dist":4.039450741263021,"lon":-121.3648,"lat":38.7159,"id":"6232be7e48b"},
            "avgdist":4.039450741263021
        },
    ...
}
*/
    return ret;
}

function ajaxres(req) {
    var res, res2;
    var lon = req.params.lon, lat=req.params.lat;

    if(req.params.id)
    {
        res2= sql.one("select " +
            "place_name +', ' + admin_name1 + ', ' + country_code place, "  +
            "postal_code zip, latitude lat, longitude lon " + 
            "from geonames where id=?;",
            [req.params.id]
        );
        if(res2) {
            lon=res2.lon;
            lat=res2.lat;
        }
    }

    if(!lon || !lat)
        return {json:{}};

    res = sql.exec("select " +
        "place_name +', ' + admin_name1 + ', ' + country_code place, "  +
        "id, postal_code, latitude, longitude, distlatlon(?, ?, latitude, longitude) dist " + 
        "from geonames where geocode between (select latlon2geocodearea(?, ?, 0.5)) order by 6 asc;",
        [lat,lon,lat,lon],
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
    // we will need at least two chars
    q = q.replace(/ \S$/, ' ');
    

    // if last character is not a space, add glob    
    if(q.charAt(q.length-1) != ' ')
        q += '*';

    sql.set({
        'likepallmatch': true,  //match every word or partial word
        'qMaxWords'    : 5000,  //allow query and sets to be larger than normal for '*' glob searches
        'qMaxSetWords' : 5000
    });
    
    // perform a text search on the words or partial words we have, and return a list of best matching locations
    res = sql.exec("select " +
        "place_name +', ' + admin_name1 + ', ' + postal_code + ', ' + country_code value, "  +
        "latitude, longitude, postal_code zip "+
        "from geonames where " +
        "place_name\\postal_code\\admin_name1\\admin_code1\\admin_name2\\admin_code2\\admin_name3\\admin_code3\\country_code "+
        "likep ?",
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

