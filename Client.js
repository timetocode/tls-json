const tls = require('tls')
const JSONStream = require('json-stream')
const EventEmitter = require('events')
const createError = require('create-error')
const NotConnectedError = createError('NotConnectedError')
const RequestModule = require('./RequestModule')

class Client extends EventEmitter {
    constructor(config) {
        super()
        this.lastReconnectTimestamp = -1
        this.socket = null
        this.isConnected = false
        this.isAuthenticated = false
        this.reconnectInterval = config.reconnectInterval || 0
        this.requests = new RequestModule(config.requestTimeout || 10000)

        this.connect = () => {
            this.socket = tls.connect(config.port, config.host, config.options, () => {
                this.socket.setEncoding('utf8')
                this.socket.write(JSON.stringify({ password: config.password }) + '\n')
            })

            const stream = JSONStream()
            this.socket.pipe(stream)

            stream.on('data', message => {
                if (this.isAuthenticated) {
                    if (message.requestId) {
                        this.requests.client_handleResponse(message, this)
                    } else if (message.responseId) {
                        this.requests.handleRequest(message)
                    } else {
                        this.emit('message', message)
                    }
                } else {
                    if (message.authenticated === true) {
                        this.isAuthenticated = true
                        this.emit('authenticated')
                    }
                }
            })

            this.socket.on('connect', () => {
                this.isConnected = true
                clearInterval(this.intervalRef)
            })

            this.socket.on('error', err => {
                this.emit('error', err)
            })

            this.socket.on('close', () => {
                this.requests.connectionLost()
                this.isConnected = false
                this.isAuthenticated = false
                this.beginReconnectInterval()
                this.emit('close')
            })
        }

        this.beginReconnectInterval()
        this.connect()
    }

    beginReconnectInterval() {
        const now = Date.now()
        if (this.reconnectInterval > 0 && !this.isConnected && now - this.reconnectInterval > this.lastReconnectTimestamp) {
            this.lastReconnectTimestamp = now
            this.intervalRef = setTimeout(() => {
                if (!this.isConnected) {
                    this.connect()
                }
            }, this.reconnectInterval)
        }
    }

    send(object) {
        if (this.socket && this.isAuthenticated) {
            this.socket.write(JSON.stringify(object) + '\n')
        } else {
            this.emit('error', new NotConnectedError('Not connected to server.', { originalMessage: object }))
        }
    }

    request(object, callback) {
        const requestObject = this.requests.createRequest(object, callback)
        if (this.socket && this.isAuthenticated) {
            this.requests.sendRequest(requestObject, this.socket)
        } else {
            this.requests.notConnected(requestObject)
        }
    }

    disconnect() {
        if (this.socket) {
            this.socket.destroy()
        }
        clearInterval(this.intervalRef)
        this.requests.notConnected(requestObject)
        this.attemptsToReconnect = false
    }
}

module.exports = Client