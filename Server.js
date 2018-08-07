const tls = require('tls')
const JSONStream = require('json-stream')
const EventEmitter = require('events')
const createError = require('create-error')
const NotConnectedError = createError('NotConnectedError')
const RequestModule = require('./RequestModule')

class Server extends EventEmitter {
    constructor(config) {
        super()
        this.password = config.password
        this.socketId = 0
        this.sockets = new Map()
        this.requests = new RequestModule(config.requestTimeout || 10000)

        this.tlsServer = tls.createServer(config.options, socket => {
            socket.isAuthenticated = false

            const id = this.socketId++
            this.sockets.set(id, socket)

            socket.setEncoding('utf8')

            const stream = JSONStream()
            socket.pipe(stream)

            stream.on('data', message => {
                if (socket.isAuthenticated) {
                    if (message.requestId) {
                        this.requests.server_handleResponse(id, message, this)
                    } else if (message.responseId) {
                        this.requests.handleRequest(message)
                    } else {
                        this.emit('message', message)
                    }
                } else {
                    // first message must be the password, and it must be correct, else destroy
                    if (message.password === this.password) {
                        socket.isAuthenticated = true
                        this.send(id, { authenticated: true })
                        this.emit('authenticated', id, socket)
                    } else {
                        this.send(id, { message: 'failed to provide correct password' })
                        socket.destroy()
                    }
                }
            })

            socket.on('close', () => {
                this.emit('close', id)
                this.sockets.delete(id)
            })

            socket.on('error', err => {
                this.emit('error', id, err)
            })
        })
    }

    listen(port, cb) {
        this.tlsServer.listen(port, () => {
            cb()
        })
    }

    send(id, object) {
        const socket = this.sockets.get(id)
        if (socket) {
            socket.write(JSON.stringify(object) + '\n')
        } else {
            this.emit('error', new NotConnectedError('Not connected to client.', { originalMessage: object }))
        }
    }

    request(id, object, callback) {
        const socket = this.sockets.get(id)
        const requestObject = this.requests.createRequest(object, callback)
        if (socket && socket.isAuthenticated) {
            this.requests.sendRequest(requestObject, socket)
        } else {
            this.requests.notConnected(requestObject)
        }
    }
}

module.exports = Server