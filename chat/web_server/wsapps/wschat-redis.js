rampart.globalize(rampart.utils);
var redis=require("rampart-redis");

var stream = "mystream";

function init(req) {
    if(req.rcl)
        return;

    var redisDir=serverConf.dataRoot + '/redis_chat';
    var redisConf = "bind 127.0.0.1 -::1\n"                      +
                    "port 23741\n"                               +
                    "pidfile " + redisDir + "/redis_23741.pid\n" +
                    "dir " + redisDir + "\n";

    /* make the directory for redis */
    var dirstat = stat(redisDir);
    if(!dirstat) {
        try {
            rampart.utils.mkdir(redisDir);
        } catch (e){
            return e;
        }
    }

    /***** Test if Redis is already running *****/
    try {
        req.rcl=new redis.init(23741);
        return;
    } catch(e){}
    
    /***** LAUNCH REDIS *********/
    var ret = shell("which redis-server");

    if (ret.exitStatus != 0) {
        return "Could not find redis-server in PATH";
    }

    var rdexec = trim(ret.stdout);

    ret = exec("nohup", rdexec, "-", {background: true, stdin:redisConf});
    var rpid = ret.pid;

    sleep(0.5);

    if (!kill(rpid, 0)) {
        return "Failed to start redis-server";
    }

    try {
        req.rcl=new redis.init(23741);
        return;
    } catch(e){
        return e;
    }
    return;
}

function getuser(req){
    /* Here is where you can look at headers, cookies or whatever 
       to find user name. */
    return req.cookies.username;
}

function sendWsMsg(req,data) {
   if (data.file) {
   // sending a file
        // JSON from redis must be decoded.
        try{
            data.file = JSON.parse(data.file);
        } catch(e){}
        if(!data.file.content)
        {
            return;
        }
        //send file metadata, then ...
        req.wsSend({
            from: data.from, 
            file: {name:data.file.name, type: data.file.type}
        });
        // ... send actual binary file
        req.wsSend(bprintf('%!B',data.file.content));
    }
    else
    // it is a text message
    {
        req.wsSend({
            from: data.from, 
            msg: data.msg
        });
    }
}

function rtrigger(req, obj) {
    try {
        req.rcl.xadd(stream, "MAXLEN", '~', '2000', "*", obj);
    } catch(e) {
        req.wsSend({
            from: "System", 
            id:req.websocketId, 
            msg: sprintf("Error sending msg: %s", e)
        });
    }
}

function setup_event_listen(req) {
    /* check for username */
    req.user_name=getuser(req);
    if(!req.user_name){
        req.wsSend({from: "System", id:req.websocketId, msg: "No user name provided, disconnecting"});
        setTimeout(function(){
            req.wsEnd();
        },5);
        return;
    }

    function receive_message(strdata) {
        if(!strdata){ // undefined on disconnect
            req.wsSend({from:'System', id:req.websocketId, msg: "you are now disconnected."})
            req.wsEnd();
            return;
        }
        var data = strdata.data[0].value;
        if(data.id != req.websocketId)
            sendWsMsg(req,data);
     }

    /* what to do if we are sent a message from another user. */
    var subscriptions = {};
    subscriptions[stream]='$'; //only listening for one stream
    req.rcl.xread_auto_async(subscriptions, receive_message);

    // set up function for when this user disconnects (either by browser disconnect or req.wsEnd() )
    req.wsOnDisconnect(function(){
        rtrigger(req,{from:'System', id:req.websocketId, msg: req.user_name+" has left the conversation"});
        req.rcl.close();
    });

    /* send a notification to all listening that we've joined the conversation */
    // msg -> everyone listening
    rtrigger(req, {from:'System', id:req.websocketId, msg: req.user_name+" has joined the conversation"});

    try {
        //send the last <=50 messages
        var msgRange = req.rcl.xrevrange(stream, '+', '-', "COUNT", 50);
    
        for (var i=msgRange.length-1; i>-1; i--) {
            var msg = msgRange[i];
            if(msg.value.from!='System')
                sendWsMsg(req,msg.value);
        }

        // send a welcome message to client from the "System".
        req.wsSend( {from: "System", msg: `Welcome ${req.user_name}`} );
    } catch(e) {
        req.wsSend( {from: "System", msg: sprintf("Error getting messages: %s",e) });
    }
}

function forward_messages(req) {
    /* we are sent a file from the client in two parts: 1) JSON meta info, 2) binary data */
    var fileInfo;  //variable for JSON meta info
    var file;  // will hold object with meta data and binary file content

    /* STEP 1:  Check message type:  Either - 
                   1) metadata for an incoming file
                   2) binary data for an incoming file
                   3) text message
    */

    // check non binary messages for JSON
    if(!req.wsIsBin && req.body.length)
    {
        /* messages are just plain text, but
           if it is a file, first we get the file meta info in JSON format */
        try{
            fileInfo=JSON.parse(req.body);
        } catch(e) {
            /* it is not binary, or json, so it must be a message */
            fileInfo = false;
        }
    }

    /* if it is binary data, we assume it is a file
       and the file info was already sent            */
    if(req.wsIsBin)
    {
        if(req.files && req.files.length)
        {
            //get the first entry of file meta info
            file = req.files.shift();
            // add the body buffer to it
            file.content = sprintf("%B", req.body);
            // tell everyone who it's from
            file.from=req.user_name;
        }
        else // handle unlikely case that metadata is not available.
            file = {from:req.user_name, name:"", type:"application/octet-stream", content:req.body};
    }
    else if(!fileInfo)
        req.body = sprintf("%s",req.body);//It's not binary, convert body buffer to a string


    /* STEP 2:  Process info from step 1 - 
                   1) if it is file metadata, save it in the "req.files" var and wait for next message
                   2) if we have both metadata and file content, trigger event and send to all other users
                   3) if we have a text message, trigger event to send message to all other users
    */
    if(fileInfo && fileInfo.file)
    {
        if(!req.files)
            req.files = [];
        /* store file meta info in req where we will retrieve it next time */
        req.files.push(fileInfo.file);
        // do nothing and get the actual binary file in the next message
    }
    else if (file)
    {
        /* we received a file, reassembled its meta info.  Send it to all that are listening */
        rtrigger(req, {from:req.user_name, id:req.websocketId, file: file});
    }
    else if(req.body.length)
    {
        //send the plain text message to whoever is listening
        rtrigger(req, {from:req.user_name, id:req.websocketId, msg:req.body});
    }

    /* Step 3:
         We received data, but here no data is sent back to the client.  However,
         it is sent to others using trigger and receive by the rampart.event.on
         function which they registered in their own connections.  So we can just return
         here
    */
}

// exporting a single function
module.exports = function (req)
{
    var err = init(req);
    if(err) {
        sendWsMsg(req, {from:'System', msg: sprintf('%s',err)});
        fprintf(stderr, '%s', err);  //this will go to error log if logging is set on
        return;
    }
    if (req.count==0) {
        /* first run upon connect, req.body is empty 
           Here is where we will set up the event to listen for
           incoming message from other users
         */
        setup_event_listen(req);
    } else {
        /* second and subsequent runs below.  Client has sent a message
           and we need to process and forward it to others who are
           listening via rampart.event.on above 
         */
        forward_messages(req);        
    }


    return null;
}
