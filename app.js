const expressWs = require('express-ws-routes');
const express = expressWs.extendExpress();

const dotenv = require("dotenv");

// Load env
dotenv.config({ path: __dirname + "/config/config.env" });
dotenv.config({ path: __dirname + "/config/secrets.env" });

const router = express.Router();

// Setup the websocket log level
global.WebSocketLogLevels = {
    None: 0,
    Minimal: 1,
    Full: 2
}

global.webSocketLogLevel = process.env.WEBSOCKET_LOG_LEVEL || WebSocketLogLevels.Minimal;

module.exports = () => {
    const module = {};

    // Connect to the database, then start http and WebSocket server
    module.startServer = async (absolutePath = "/tempus") => {
        // Connect to database here

        const WebSocketServer = require('./network/WebSocketServer');

        console.log("[Tempus] Started websocket server at path '%s'", absolutePath)
        router.websocket("/", (info, cb) => cb(WebSocketServer.onConnection));
        
        // Set up http routes here 
    }

    module.router = router;

    return module; 
}