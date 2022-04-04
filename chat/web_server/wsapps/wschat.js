rampart.globalize(rampart.utils);
var ev = rampart.event;

//ev.scopeToModule();

function getuser(req){
    /* Here is where you can look at headers, cookies or whatever 
       to find user name. */
    return req.cookies.username;
}

/* NOTES:
 * The module.exports function is run for every incoming websocket message.
 * The first run (req.count==0) will have an empty body and represents the initial connection.
 * The req object is reused with req.body updated for each incoming message.
 * Sending data back is done with req.wsSend().
 * Any data printed or put using req.printf/req.put will also be sent when
 *   req.wsSend() is called or when the module.exports function returns
 * req.count == number of times function has been called since connection was made.
 * req.wsOnDisconnect is a function that is run when you disconnect or you are disconnected by the client.
 * req.wsEnd forces a disconnect (but runs callback first);
 * req.websocketId is a unique number to identify the current connection to a single client.
 * req.wsIsBin is true if the client sends binary data.  Data will be in req.body
 * req.body is always a buffer.  If req.wsIsBin is false, it can be converted to a string.
 *   using rampart.utils.sprintf('%s',req.body) or rampart.utils.bufferToString(req.body)
 */


/* process incoming message as sent below in ev.trigger() with data set to
   { from: user_name, id: user_id, [ msg: "a message" | file: binary_file_data] }
*/
function receive_message(req, data) {
    if(data.id != req.websocketId) {//don't echo our own message
        // is this a file?  Sent two messages.
        if (data.file)
        {
            //send file metadata, then ...
            req.wsSend({
                from: data.from, 
                file: {name:data.file.name, type: data.file.type}
            });
            // ... send actual binary file
            req.wsSend(data.file.content);
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

    /* what to do if we are sent a message from another user.  Here rampart.event.on
       registers a function to be executed.  The function takes a parameter from "on"
       and a parameter from "trigger". The function is registered with the event name
       "msgev" and the function name "userfunc_x" where x is the unique websocketId for
       this connection. The varable "req" is passed to the proc_incoming_message as its
       first argument.                                                                   */
    ev.on("msgev", "userfunc_"+req.websocketId, receive_message, req);

    // set up function for when this user disconnects (either by browser disconnect or req.wsEnd() )
    req.wsOnDisconnect(function(){ 
        // msg -> everyone listening
        ev.trigger("msgev", {from:'System', id:req.websocketId, msg: req.user_name+" has left the conversation"});
        // remove our function unique to this use from the event
        ev.off("msgev", "userfunc_"+req.websocketId);
    });

    /* send a notification to all listening that we've joined the conversation */
    // msg -> everyone listening
    ev.trigger("msgev", {from:'System', id:req.websocketId, msg: req.user_name+" has joined the conversation"});
    // send a welcome message to client from the "System".
    req.wsSend( {from: "System", msg: `Welcome ${req.user_name}`} );
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
            file.content = req.body;
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
        ev.trigger("msgev", {from:req.user_name, id:req.websocketId, file: file});
    }
    else if(req.body.length)
    {
        //send the plain text message to whoever is listening
        ev.trigger("msgev", {from:req.user_name, id:req.websocketId, msg:req.body});
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
