const tls = require('tls')
const JSONStream = require('json-stream')
const EventEmitter = require('events')

class Server extends EventEmitter {
    constructor(config) {
        super()
        this.password = config.password
        this.socketId = 0
        this.sockets = new Map()

        const options = {
            key: config.key,
            cert: config.cert,      
            rejectUnauthorized: true,
        }
        
        this.tlsServer = tls.createServer(options, socket => {
            socket.isAuthenticated = false

            var id = this.socketId++
            this.sockets.set(id, socket)

            socket.setEncoding('utf8')           
        
            var stream = JSONStream()
            socket.pipe(stream)
    
            stream.on('data', message => {
                if (socket.isAuthenticated) {
                    this.emit('message', id,  message)
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

    listen(port) {
        this.tlsServer.listen(port, () => {
            console.log('Listening on port', port)
        })
    }

    send(id, object) {
        var socket = this.sockets.get(id)
        if (socket) {
            socket.write(JSON.stringify(object) + '\n')
        }
    }
}

module.exports = Server
