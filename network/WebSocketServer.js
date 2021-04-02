const Client = require("./Client");

const Utils = require("../utils/Utils");

const YoutubeApi = require("../utils/YoutubeApi");
const { playVideoFromQueue } = require("../utils/Api");

const pingTime = process.env.WEBSOCKET_PING_TIME || 30000;

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

        // Aliases
        const originalMessage = JSON.parse(JSON.stringify(message));

        switch (message.type) {
            // Sessions
            case "join-session": {
                const sessionId = (message.data && message.data.sessionId) || Utils.createId();

                client.joinSession(sessions, sessionId);

                // Calculate the video timestamp as a long time could have passed since the last state update
                const { lastStateUpdateTime } = client.sessionData();

                console.log(lastStateUpdateTime);

                if (lastStateUpdateTime != null) {
                    const passedTime = (Date.now() - client.sessionData().lastStateUpdateTime) / 1000; // In seconds
                    
                    const video = client.session.getPlayingVideo();
                    if (video) {
                        const oldTimestamp = video.timestamp;
                        const newTimestamp = oldTimestamp + passedTime * video.playbackSpeed;
                        video.timestamp = newTimestamp;

                        client.sessionData().lastStateUpdateTime = Date.now();

                        console.log("Updated video timestamp from %s to %s", oldTimestamp, newTimestamp);

                        //client.sendResponse({ state: client.sessionData() }, { type: "state-update" }, client.SendType.Broadcast);
                    }
                }

                const response = {
                    sessionId: sessionId,
                    clientId: client.id,
                    isAdmin: client.isAdmin,
                    state: client.session.data
                }

                client.sendResponse(response, originalMessage, client.SendType.Single);

                broadcastClients(client.session);

                break;
            }

            case "state-update": {
                if (!client.session)
                    return client.sendError("You are not in a session", originalMessage);

                const { timestamp, playbackSpeed, isPaused, firstLoad } = message.data;

                const sessionData = client.sessionData();
                const video = sessionData.queue[sessionData.currentQueueIndex];
                if (!video) return client.sendError("[Tempus] That video doesn't exist in the queue", originalMessage);

                // if (firstLoad && !video.hasLoaded) {
                //     console.log("Video has loaded for the first time");

                //     // Start internal
                //     const dur = 1000;
                //     if (client.timestampTimer) clearInterval(client.timestampTimer);

                //     client.timestampTimer = setInterval(() => {
                //         if (!client.session) return;

                //         const video = client.session.playingVideo();
                //         if (video.timestamp == null) return;
                //         if (video.isPaused) return;

                //         video.timestamp += dur / 1000;

                //         console.log("Video timestamp:", video.timestamp);
                //     }, dur);
                // }

                const timeForMessage = Math.abs(Date.now() - message.date) / 1000;
                // const totalTimeForMessage = timeForMessage * 2; // Assume it takes the same amount of time to be sent back

                const timestampDiff = ((timestamp + timeForMessage) - video.timestamp);
                const timestampAdjusted = timestamp + timeForMessage;

                // console.log("The server timestamp is %s off. Acutal client value is", timestampDiff, timestamp);

                video.timestamp = timestampAdjusted;
                video.playbackSpeed = playbackSpeed;
                video.isPaused = isPaused;

                sessionData.lastStateUpdateTime = message.date;

                if (firstLoad) video.hasLoaded = true;

                console.log("Video timestamp:", timestampAdjusted, timeForMessage);

                client.sendResponse({ state: client.sessionData() }, originalMessage, client.SendType.Broadcast);

                break;
            }

            case "timestamp-update": {
                if (!client.session)
                    return client.sendError("You are not in a session", originalMessage);

                const sessionData = client.sessionData();
                const video = sessionData.queue[sessionData.currentQueueIndex];

                const timeForMessage = Date.now() - message.date;

                console.log(timeForMessage);

                break;
            }

            // case "play-video": {
            //     if (!client.session)
            //         return client.sendError("You are not in a session", originalMessage);

            //     const videoId = Utils.getVideoId(message.data.videoUrl);


            //     client.session.videoData.currentVideoId = videoId;

            //     console.log("Playing video '%s'", videoId);

            //     client.sendResponse({ currentVideoId: message.data.videoId }, message, client.SendType.Broadcast);

            //     break;
            // }

            case "play-video-from-queue": {
                try {
                    const response = playVideoFromQueue(client, { queueIndex: message.data.queueIndex });

                    client.sendResponse(response, originalMessage, client.SendType.Broadcast);
                } catch (error) {
                    client.sendError(error, originalMessage);
                }

                break;
            }

            case "play-next-video": {
                try {
                    if (!client.session) return client.sendError("You are not in a session", originalMessage);

                    const queueIndex = client.sessionData().currentQueueIndex + 1;
                    // Bounds check
                    if (queueIndex > client.sessionData().queue.length) return;

                    const response = playVideoFromQueue(client, { queueIndex });

                    client.sendResponse(response, originalMessage, client.SendType.Broadcast);
                } catch (error) {
                    client.sendError(error, originalMessage);
                }

                break;
            }

            case "add-video-to-queue": {
                if (!client.session) return client.sendError("You are not in a session", originalMessage);

                const url = message.data.url;
                if (!url) return client.sendError("No video url specified", originalMessage);

                const videoId = Utils.getVideoId(url);
                if (!videoId) return client.sendError("Not a youtube video", originalMessage);

                // Check for duplicates
                if (client.sessionData().queue.find(video => video.id === videoId))
                    return client.sendError("That video already exists in the queue", originalMessage)

                const videoData = await YoutubeApi.getVideoDetails(videoId);
                if (!videoData)
                    return client.sendError("Failed to get video details", originalMessage);

                // Create a video object to add to the queue 
                const video = { ...videoData, url };
                client.sessionData().queue.push(video);

                // Play the video if it's the first in the queue
                if (client.sessionData().queue.length == 1) {
                    try {
                        const response = playVideoFromQueue(client, { queueIndex: 0 });
                        client.sendResponse(response, { type: "play-video-from-queue" }, client.SendType.Broadcast);
                    } catch (error) {
                        if (typeof error === "object")
                            console.error(error);

                        client.sendError(error, { type: "play-video-from-queue" });
                    }
                }

                client.sendResponse({ video, queue: client.sessionData().queue }, originalMessage, client.SendType.Broadcast);

                console.log(video)

                break;
            }

            case "delete-video-from-queue": {
                if (!client.session)
                    return client.sendError("You are not in a session", originalMessage);

                const queue = client.sessionData().queue;
                const entry = queue.find(item => item.id == message.data.id);
                if (!entry) return client.sendError("Failed to delete video. Invalid ID", originalMessage);

                // Remove that specific index
                const index = queue.indexOf(entry);
                queue.splice(index, 1);

                client.sendResponse({ deleted: message.data.id, queue: queue }, originalMessage, client.SendType.Broadcast);

                break;
            }

            // case "get-video-metadata": {
            //     if (!message.data.url)
            //         return client.sendError("No video url specified", message);

            //     const url = message.data.url;
            //     const videoId = Utils.getVideoId(message.data.url);
            //     if (!videoId)
            //         return client.sendError("Not a youtube video", message);

            //     const videoData = await YoutubeApi.getVideoDetails(videoId);
            //     if (!videoData.items)
            //         return client.sendError("Failed to get video details", message);

            //     const title = videoData.items[0].snippet.title;
            //     const channel = videoData.items[0].snippet.channelTitle;

            //     // Get video duration in minutes
            //     const durationString = videoData.items[0].contentDetails.duration
            //     const arrOfTime = durationString.replace("PT", "").replace("H", " ").replace("M", " ").replace("S", "").split(" ");

            //     // Minutes, seconds
            //     console.log(arrOfTime)
            //     var duration = 0;
            //     if (arrOfTime.length === 1) // Seconds
            //         duration = parseInt(arrOfTime[0]) / 60;
            //     else if (arrOfTime.length === 2) // Minutes, seconds
            //         duration = parseInt(arrOfTime[0]) + parseInt(arrOfTime[1]) / 60;
            //     else if (arrOfTime.length === 3) // Hours, minutes, seconds
            //         duration = parseInt(arrOfTime[0]) * 60 + parseInt(arrOfTime[1]) + parseInt(arrOfTime[2]) / 60;

            //     const response = {
            //         title,
            //         channel,
            //         url,
            //         videoId,
            //         duration
            //     };

            //     client.sendResponse(response, message, client.SendType.Broadcast);

            //     break;
            // }

            case "broadcast-clients": {

                broadcastClients(client);

                break;
            }

            // Ping Pong
            case "pong": {
                client.isAlive = true; // The client is still connected

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