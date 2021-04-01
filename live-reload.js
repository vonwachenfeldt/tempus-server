const dotenv = require("dotenv");

if (!process.env.TEMPUS_CLIENT_PATH)
    dotenv.config({ path: __dirname + "/config/secrets.env" });

const paths = [ __dirname ];
if (process.env.TEMPUS_CLIENT_PATH) paths.push(process.env.TEMPUS_CLIENT_PATH);

const liveReload = require("@thebigbear/live-reload");
liveReload.start(paths);