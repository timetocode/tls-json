const tls = require('tls')
const JSONStream = require('json-stream')
const EventEmitter = require('events')

class Client extends EventEmitter {
    constructor(config) {
        super()
        this.socket = null
        this.isConnected = false
        this.isAuthenticated = false
        this.attemptsToReconnect = config.attemptsToReconnect > 0
        
        this.options = {
            ca: [ config.cert ]
        }

        var connect = () => {
            this.socket = tls.connect(config.port, config.host, this.options, () => {
                this.socket.setEncoding('utf8')
                var stream = JSONStream()
                this.socket.pipe(stream)            
            
                stream.on('data', message => {
                    if (this.isAuthenticated) {
                        this.emit('message', message) 
                    } else {
                        if (message.authenticated === true) {
                            this.isAuthenticated = true
                            this.emit('authenticated')
                        }
                    }          
                })
            
                this.socket.write(JSON.stringify({ password: config.password }) + '\n')
            })
    
            this.socket.on('connect', () => {
                this.isConnected = true
            })
    
            this.socket.on('error', err => {
                this.emit('error', err)
            })
    
            this.socket.on('close', () => {
                this.isConnected = false
                this.emit('close')
            })
        }

        if (this.attemptsToReconnect) {
            this.intervalRef = setInterval(() => {
                if (!this.connected) {
                   connect()
                }
            }, config.reconnectInterval)
        }

        connect()
    }

    send(object) {
        if (this.socket && this.isAuthenticated) {
            this.socket.write(JSON.stringify(object) + '\n')
        }
    }

    disconnect() {
        if (this.socket) {
            this.socket.destroy()
        }
        clearInterval(this.intervalRef)
        this.attemptsToReconnect = false
    }
}

module.exports = Client
