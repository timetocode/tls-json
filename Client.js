const tls = require('tls')
const JSONStream = require('json-stream')
const EventEmitter = require('events')
const RequestModule = require('./RequestModule')

class Client extends EventEmitter {
    constructor(config) {
        super()
        this.lastReconnectTimestamp = -1
        this.socket = null
        this.isConnected = false
        this.isAuthenticated = false
        this.reconnectInterval = config.reconnectInterval || 0
        this.attemptsToReconnect = true
        this.requests = new RequestModule(config.requestTimeout || 10000)
        this.supressNextECONNREFUSED = false

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
                } else if (message.error) {
                    this.emit('message', message)
                } else {
                    if (message.authenticated === true) {
                        this.isAuthenticated = true
                        this.emit('authenticated')
                    }
                }
            })

            this.socket.on('connect', () => {
                this.supressNextECONNREFUSED = false
                this.isConnected = true
                clearInterval(this.intervalRef)
            })

            this.socket.on('error', err => {
                if (this.supressNextECONNREFUSED && err.code && err.code === 'ECONNREFUSED') {
                    return
                }
                this.emit('error', err)
            })

            this.socket.on('end', () => {

            })

            this.socket.on('close', () => {
                this.requests.cancelAll()
                this.isConnected = false
                this.isAuthenticated = false
                this.beginReconnectInterval()
                if (!this.supressNextECONNREFUSED) {
                    this.emit('close')
                }
                
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
                if (!this.isConnected && this.attemptsToReconnect) {
                    this.supressNextECONNREFUSED = true
                    this.emit('reconnectAttempt')
                    this.connect()
                }
            }, this.reconnectInterval)
        }
    }

    send(object) {
        if (this.socket && this.isAuthenticated) {
            this.socket.write(JSON.stringify(object) + '\n')
        } else {
            this.emit('error', new Error('not connected or not authenticated'))
        }
    }

    async request(object) {
        if (this.socket && this.isAuthenticated) {
            return await this.requests.sendRequest(object, this.socket)
        } else {
            const err = new Error('not connected or not authenticated')
            return Promise.reject(err)
        }
    }

    disconnect() {
        if (this.socket) {
            this.socket.end()
            this.socket.destroy()
        }
        clearInterval(this.intervalRef)
        this.attemptsToReconnect = false
    }
}

module.exports = Client