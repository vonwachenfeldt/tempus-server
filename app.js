const express = require("express");
const http = require("http");
const dotenv = require("dotenv");

// Load env
dotenv.config({ path: __dirname + "/config/config.env" });
dotenv.config({ path: __dirname + "/config/secrets.env" });

const app = express();

// Setup the websocket log level
global.WebSocketLogLevels = {
    None: 0,
    Minimal: 1,
    Full: 2
}

global.webSocketLogLevel = process.env.WEBSOCKET_LOG_LEVEL || WebSocketLogLevels.Minimal;

module.exports = () => {
    const module = {};

    const PORT = process.env.PORT || 3500;

    // Connect to the database, then start http and WebSocket server
    module.startServer = async (server, path = "/") => {
        // Connect to database here

        const WebSocketServer = require('./network/WebSocketServer');
        
        // Set up http routes here

        // Create and start the server manually if none is specified
        if (!server) {
            server = http.createServer(app);

            server.listen(PORT, () => console.log("Http server running on port %s", PORT));
        }

        // Start websocket server
        WebSocketServer(server, path);
    }

    module.app = app;

    return module;
}