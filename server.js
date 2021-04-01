const app = require('express-ws-routes')();

// Set node_env from arguments
if (process.argv[2] == "--production" || process.argv[2] == "--development")
    process.env.NODE_ENV = process.argv[2].slice(2); // don't include dashes

// Import the app
const { router, startServer } = require("./app")();

// Start the server
startServer("/tempus");

app.use("/tempus", router);

const port = process.env.app_port || process.env.TEMPUS_PORT || 8080;
app.listen(port, console.log("[Tempus] Server running on port", port));