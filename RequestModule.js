class RequestModule {
    constructor(requestTimeout) {
        this.requestId = 1
        this.requests = new Map()
        this.requestTimeout = requestTimeout
    }

    cancelAll() {
        this.requests.forEach((promise, requestId) => {
            promise.reject(new Error('connection lost'))
            this.requests.delete(requestId)
        })
    }

    sendRequest(message, socket) {
        const requestId = this.requestId++
        message.requestId = requestId

        const promiseWrap = {
            requestId,
            originalMessage: message,
            promise: null,
            resolve: null,
            reject: null
        }

        const promise = new Promise((resolve, reject) => {
            promiseWrap.resolve = resolve
            promiseWrap.reject = reject
            setTimeout(() => {
                this.requests.delete(requestId)
                reject(new Error('request timeout'))
            }, this.requestTimeout)         
        })
        promiseWrap.promise = promise 
        this.requests.set(requestId, promiseWrap)

        // the actual writing of the json to the tcp stream
        socket.write(JSON.stringify(message) + '\n')
        return promise
    }

    // invoked when parsing the stream discovers a json object with a `responseId`
    handleRequest(message) {
        const responseId = message.responseId        
        const promiseWrap = this.requests.get(responseId)
        if (promiseWrap) {
            promiseWrap.resolve(message)
        }
        delete message.responseId
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