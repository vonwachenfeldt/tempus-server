const app = require('express-ws-routes')();

// Import the app
const { router, startServer } = require("./app")();

// Start the server
startServer("/tempus");

app.use("/tempus", router);

const port = process.env.app_port || process.env.TEMPUS_PORT || 8080;
app.listen(port, console.log("[Tempus] Server running on port", port));