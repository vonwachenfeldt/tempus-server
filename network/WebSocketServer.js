const WebSocketServer = require("ws").Server;

const Client = require("./Client");

const Utils = require("../utils/Utils");

const YoutubeApi = require("../utils/YoutubeApi");

const pingTime = process.env.WEBSOCKET_PING_TIME || 30000;

const logPingMessages = process.env.WEBSOCKET_LOG_PINGPONG_MESSAGES || false;

let ws;

var sessions = new Map();

const onConnection = (conn) => {
    // Create client
    const client = new Client(conn, Utils.createId());

    if (webSocketLogLevel >= WebSocketLogLevels.Minimal)
        console.log("Client '%s' connected", client.id); 

    // Remove the client from any sessions
    conn.on("close", () => disconnectClient(client));

    // Handle messages
    conn.on("message", message => handleMessage(client, message)); 

    // Setup ping pong
    client.pingPongTimer = setInterval(() => pingPong(client), pingTime);
}

const handleMessage = async (client, message) => {
    try {
        message = JSON.parse(message); // Parse

        switch (message.type) {
            // Sessions
            case "join-session": {
                const sessionId = (message.data && message.data.sessionId) || Utils.createId();

                client.joinSession(sessions, sessionId);

                const response = {
                    sessionId: sessionId,
                    clientId: client.id,
                    state: client.session.videoData
                }

                client.sendResponse(response, message, client.SendType.Single);
                
                broadcastClients(client.session);

                break;
            } 

            case "state-update": {
                if (!client.session)
                    return client.sendError("You are not in a session", message);

                const { timestamp, playbackSpeed, isPaused, currentVideoId } = message.data;

                client.session.videoData.timestamp = timestamp;
                client.session.videoData.playbackSpeed = playbackSpeed;
                client.session.videoData.isPaused = isPaused;
                client.session.videoData.currentVideoId = currentVideoId;

                client.sendResponse(message.data, message, client.SendType.Broadcast);

                break;
            }

            case "play-video": {
                if (!client.session)
                    return client.sendError("You are not in a session", message);

                const videoId = Utils.getVideoId(message.data.videoUrl);

                client.session.videoData.currentVideoId = videoId;

                console.log("Playing video '%s'", videoId);

                client.sendResponse({ currentVideoId: message.data.videoId }, message, client.SendType.Broadcast);

                break;
            }

            case "play-next-video": {
                playNextVideo(client);

                break;
            }

            case "queue-video": {
                if (!client.session)
                    return client.sendError("You are not in a session", message);

                    if (!message.data.url)
                    return client.sendError("No video url specified", message);

                const url = message.data.url;
                const videoId = Utils.getVideoId(message.data.url);
                if (!videoId)
                    return client.sendError("Not a youtube video", message);

                const videoData = await YoutubeApi.getVideoDetails(videoId);
                if (!videoData.items)
                    return client.sendError("Failed to get video details", message);

                const title = videoData.items[0].snippet.title;
                const channel = videoData.items[0].snippet.channelTitle;

                // Get video duration in minutes
                const durationString = videoData.items[0].contentDetails.duration
                const arrOfTime = durationString.replace("PT", "").replace("H", " ").replace("M", " ").replace("S", "").split(" ");
    
                // Minutes, seconds
                console.log(arrOfTime)
                var duration = 0;
                if (arrOfTime.length === 1) // Seconds
                    duration = parseInt(arrOfTime[0]) / 60;
                else if (arrOfTime.length === 2) // Minutes, seconds
                    duration = parseInt(arrOfTime[0]) + parseInt(arrOfTime[1]) / 60;
                else if (arrOfTime.length === 3) // Hours, minutes, seconds
                    duration = parseInt(arrOfTime[0]) * 60 + parseInt(arrOfTime[1]) + parseInt(arrOfTime[2]) / 60;

                const data = {
                    title,
                    channel,
                    url,
                    videoId,
                    duration,
                    id: Utils.createId()
                };

                if (client.session.videoData.queue.length == 0 && !client.session.videoData.currentVideoId) {
                    // Add
                    client.session.videoData.queue.push(data);
                    playNextVideo(client);
                } else {
                    client.session.videoData.queue.push(data);
                    console.log("Queing video '%s'", data.videoId);
                }

                client.sendResponse({ queue: client.session.videoData.queue }, message, client.SendType.Broadcast);

                break;
            }

            case "delete-queue-entry": {
                if (!client.session)
                    return client.sendError("You are not in a session", message);
                
                var queue = client.session.videoData.queue;
                const entry = queue.find(item => item.id == message.data.id);
                if(!entry) return client.sendError("Invalid ID", message);
                const index = queue.indexOf(entry);

                queue.splice(index, 1);
                client.sendResponse({ queue: queue, id: message.data.id }, message, client.SendType.Broadcast);

                break;
            }

            case "get-video-metadata": {
                if (!message.data.url)
                    return client.sendError("No video url specified", message);

                const url = message.data.url;
                const videoId = Utils.getVideoId(message.data.url);
                if (!videoId)
                    return client.sendError("Not a youtube video", message);

                const videoData = await YoutubeApi.getVideoDetails(videoId);
                if (!videoData.items)
                    return client.sendError("Failed to get video details", message);

                const title = videoData.items[0].snippet.title;
                const channel = videoData.items[0].snippet.channelTitle;

                // Get video duration in minutes
                const durationString = videoData.items[0].contentDetails.duration
                const arrOfTime = durationString.replace("PT", "").replace("H", " ").replace("M", " ").replace("S", "").split(" ");
    
                // Minutes, seconds
                console.log(arrOfTime)
                var duration = 0;
                if (arrOfTime.length === 1) // Seconds
                    duration = parseInt(arrOfTime[0]) / 60;
                else if (arrOfTime.length === 2) // Minutes, seconds
                    duration = parseInt(arrOfTime[0]) + parseInt(arrOfTime[1]) / 60;
                else if (arrOfTime.length === 3) // Hours, minutes, seconds
                    duration = parseInt(arrOfTime[0]) * 60 + parseInt(arrOfTime[1]) + parseInt(arrOfTime[2]) / 60;

                const response = {
                    title,
                    channel,
                    url,
                    videoId,
                    duration
                };
            
                client.sendResponse(response, message, client.SendType.Broadcast);

                break;
            }

            case "broadcast-clients": {

                broadcastClients(client);

                break;
            }

            // Ping Pong
            case "pong": {
                client.isAlive = true; // The client is still connected

                //if (logPingMessages) console.log("Received pong from client '%s'", client.id);
                
                break;
            }

            default: {
                console.log("Other message:", message);

                break;
            }
        }
    } catch (error) {
        console.log(message);
        console.error(error);
    }
}

const pingPong = (client) => {
    // Terminate the connection with the client if it isn't alive
    if (!client.isAlive) return client.terminate();

    // Default the client to being disconnected, but if a pong message is received from them they are considered still alive
    client.isAlive = false;

    //if (logPingMessages) console.log("Sending ping to client '%s'", client.id);

    client.ping();
}

const disconnectClient = (client) => {
    const session = client.session;

    // If the client is in a session
    if (session) {
        session.leave(client); // Remove the client from the session

        broadcastClients(session);

        if (webSocketLogLevel >= WebSocketLogLevels.Minimal)
            console.log("Client '%s' disconnected, %s clients remaining in session '%s'", client.id, session.clients.size, session.id);

        // Remove the session if it's empty
        if (session.clients.size == 0) {
            sessions.delete(session.id);

            if (webSocketLogLevel >= WebSocketLogLevels.Minimal)
                console.log("Removing empty session '%s'", session.id);
        }
    } else {
        if (webSocketLogLevel >= WebSocketLogLevels.Minimal)
            console.log("Client '%s' disconnected", client.id);
    } 

    // Remove the ping pong
    clearInterval(client.pingPongTimer);

    // Terminate the connection
    client.terminate();
}

function broadcastClients(session) {
    const response = {
        watchers: session.clients.size
    }

    session.broadcastResponse(response, { type: "broadcast-clients" });
}

const playNextVideo = (client, message = { type: "play-next-video" }) => {
    if (!client.session)
        return client.sendError("You are not in a session", message);

    // Only play the next video if one exists
    if (client.session.videoData.queue.length == 0)
        return;

    const nextVideo = JSON.parse(JSON.stringify(client.session.videoData.queue[0]));
    client.session.videoData.queue.shift(); // Remove the video from the queue

    const videoId = Utils.getVideoId(nextVideo.url);

    client.session.videoData.currentVideoId = videoId;

    console.log("Playing next video '%s'", videoId);

    client.sendResponse({ video: nextVideo, queue: client.session.videoData.queue }, message, client.SendType.Broadcast);
}

module.exports.onConnection = onConnection;