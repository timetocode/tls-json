const createError = require('create-error')

const RequestTimedOutError = createError('RequestTimedOutError')
const RequestNotConnectedError = createError('RequestNotConnectedError')
const RequestConnectionLostError = createError('RequestConnectionLostError')

class RequestModule {
    constructor(requestTimeout) {
        this.requestId = 1
        this.requests = new Map()
        this.requestTimeout = requestTimeout
        this.interval = setInterval(() => {
            this.checkTimeouts()
        }, 1000)
    }

    destroy() {
        clearInterval(this.interval)
    }

    checkTimeouts() {
        const now = Date.now()
        this.requests.forEach((request, requestId) => {
            if (now >= request.timestamp + this.requestTimeout) {
                request.callback(new RequestTimedOutError('Request timed out.', { originalMessage: request.message }), null)
                this.requests.delete(requestId)
            }
        })
    }

    connectionLost() {
        this.requests.forEach((request, requestId) => {
            request.callback(
                new RequestConnectionLostError('Request incomplete due to connection loss.', {
                    originalMessage: request.message
                }), null)

            this.requests.delete(requestId)
        })
    }

    notConnected(requestObject) {
        requestObject.callback(
            new RequestNotConnectedError('Not connected to server.', {
                originalMessage: requestObject.message
            }), null)
    }

    createRequest(object, callback) {
        const id = this.requestId++
        object.requestId = id
        return {
            requestId: id,
            timestamp: Date.now(),
            message: object,
            callback: callback
        }
    }

    sendRequest(requestObject, socket) {
        this.requests.set(requestObject.requestId, requestObject)
        socket.write(JSON.stringify(requestObject.message) + '\n')
    }
    
    handleRequest(message) {
        const responseId = message.responseId
        delete message.responseId
        this.requests.get(responseId).callback(null, message)
        this.requests.delete(responseId)
    }

    client_handleResponse(message, tlsNode) {
        const requestId = message.requestId
        delete message.requestId
        tlsNode.emit('request',
            message,
            {
                send: msg => {
                    msg.responseId = requestId
                    tlsNode.send(msg)
                }
            }
        )
    }

    server_handleResponse(id, message, tlsNode) {
        const requestId = message.requestId
        delete message.requestId
        tlsNode.emit('request',
            id,
            message,
            {
                send: msg => {
                    msg.responseId = requestId
                    tlsNode.send(id, msg)
                }
            }
        )
    }
}

module.exports = RequestModule