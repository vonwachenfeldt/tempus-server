const fetch = require("node-fetch");

const getVideoDetails = async (videoId) => {
    const youtubeKey = process.env.YOUTUBE_KEY;
    const response = await fetch(`https://youtube.googleapis.com/youtube/v3/videos?part=snippet&part=contentDetails&id=${videoId}&key=${youtubeKey}`, {
        headers: { "Accept": "application/json" }
    });

    const json = await response.json();

    console.log(json)

    return json;
}

module.exports.getVideoDetails = getVideoDetails;