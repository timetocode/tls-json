const tls = require('tls')
const JSONStream = require('json-stream')
const EventEmitter = require('events')
const RequestModule = require('./RequestModule')

const randomInteger = (max) => {
    return Math.floor(Math.random() * Math.floor(max))
}

class Server extends EventEmitter {
    constructor(config) {
        super()
        this.password = config.password
        this.socketId = 0
        this.sockets = new Map()
        this.requests = new RequestModule(config.requestTimeout || 10000)
        
        const keepAliveIntervalMs = config.keepAliveInterval || 10000
        const keepAliveTimeoutMs = config.keepAliveTimeout || 5000

        this.tlsServer = tls.createServer(config.options, socket => {
            socket.isAuthenticated = false
            const id = this.socketId++
            this.sockets.set(id, socket)

            const pendingPings = new Map()

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
                        if (message.__pong) {
                            // keepAlive pong
                            const pendingPing = pendingPings.get(message.__pong)
                            if (pendingPing) {
                                pendingPings.delete(pendingPing.key)
                                clearTimeout(pendingPing.pingTimeout)
                            }
                        } else {
                            // regular message, release it
                            this.emit('message', id, message)
                        }
                    }
                } else {
                    // first message must be the password, and it must be correct, else destroy
                    if (message.password === this.password) {
                        socket.isAuthenticated = true
                        this.send(id, { authenticated: true })
                        this.emit('authenticated', id, socket)

                        // begin keepAlive checks for this socket
                        socket.keepAliveInterval = setInterval(async () => {
                            const pingKey = randomInteger(65535) // number is not significant
                            this.send(id, { __ping: pingKey })
                            const pingTimeout = setTimeout(() => {
                                this.emit('timeout', id)
                                socket.destroy()
                            }, keepAliveTimeoutMs)

                            pendingPings.set(pingKey, {
                                key: pingKey,
                                pingTimeout
                            })
                        }, keepAliveIntervalMs)

                    } else {
                        this.send(id, { error: 'incorrect password' })
                        socket.destroy()
                    }
                }
            })

            socket.on('close', () => {
                if (socket.keepAliveInterval) {
                    clearInterval(socket.keepAliveInterval)
                }
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

    close(cb) {
        this.tlsServer.close(cb)
    }

    send(id, object) {
        const socket = this.sockets.get(id)
        if (socket && !socket.destroyed) {
            socket.write(JSON.stringify(object) + '\n')
        } else {
            this.emit('error', new Error('not connected'))
        }
    }

    async request(id, object) {
        const socket = this.sockets.get(id)
        if (socket && socket.isAuthenticated) {
            return await this.requests.sendRequest(object, socket)
        } else {
            const err = new Error('not connected or not authenticated')
            return Promise.reject(err)
        }
    }
}

module.exports = Server