class Session
{
    constructor(id)
    {
        this.id = id;
        this.clients = new Set; 

        this.timestampTimer = null;

        this.data = {
            currentQueueIndex: 0,
            lastStateUpdateTime: null,
            queue: []
        };
    }

    getPlayingVideo()
    {
        return this.data.queue[this.data.currentQueueIndex];    
    }

    broadcast(data)
    {
        if (webSocketLogLevel >= WebSocketLogLevels.Minimal)
            console.log("Broadcasting to all %s connected clients in session '%s'. Message type: '%s'", this.clients.size, this.id, data.type);

        this.clients.forEach(client => client.send(data));
    }

    broadcastResponse(response, originalMessage) {
        // Send back a formatted response with type, success, original message and the data
        const res = {
            type: originalMessage.type,
            success: true,
            date: Date.now(),

            originalMessage: originalMessage,
            data: response
        }

        // Set who the message was sent by
        res.originalMessage.sentBy = this.id;

        // Add all the client ids
        // if (sendType == this.SendType.Broadcast)
        //     res.clients = [...this.session.clients].map(client => ({ id: client.id, isMe: client.id == this.id }));

        this.broadcast(res);
    }

    leave(client) {
        if (client.session !== this) throw { message: "The client is not in this session" };
		
		this.clients.delete(client);
		client.session = null;
    }
}

module.exports = Session;