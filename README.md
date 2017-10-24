# tls-json
A client and server that communicate over tls by sending json messages after verification of a password.

# Install
    npm install tls-json

# Usage

## Generate certificate
```
openssl genrsa -out server-key.pem 4096
openssl req -new -key server-key.pem -out server-csr.pem
openssl x509 -req -in server-csr.pem -signkey server-key.pem -out server-cert.pem
```

## Server

```javascript
const fs = require('fs')
const TLSServer = require('tls-json').Server

const server = new TLSServer({
    key: fs.readFileSync('server-key.pem'), 
    cert: fs.readFileSync('server-cert.pem'), 
    password: 'kitty'
})

server.on('authenticated', (id, socket) => {
    server.send(id, { message: 'welcome' })
    console.log('authenticated and welcomed', id)
})

server.on('close', id => {
    console.log('connection closed', id)
})

server.on('error', (id, err) => {
    console.log('error', err, 'from', id)
})

server.on('message', (id, message) => {
    console.log('received', message, 'from', id)
})

server.on('request', (id, message, response) => {
    console.log('received', message, 'as a request, responding')
    response.send({ blah: "this response is specific to your message" })
})

server.listen(8000, () => {
    console.log('Listening...')
})
```

The server is created with a key, cert, and password. The server listens for messages and can send messages. JSON.stringify and JSON.parse are called automatically, and the underlying tcp stream is parsed for complete json messages before a 'message' event is emitted.

Clients send a password as their first message, and are authenticated or disconnected as a result.

Clients are assigned an id when they connect, and their id is the first arg for all events. The server can send a message to a client via its id (or you can retain the reference to the socket).

## Client
```javascript
const fs = require('fs')
const TLSClient = require('tls-json').Client

const client = new TLSClient({ 
    cert: fs.readFileSync('server-cert.pem'),
    reconnectInterval: 5000,
    host: 'localhost',
    port: 8000,
    password: 'kitty'
})

// no one listens, this is sent before the client is authenticated
client.send({ blahblah: "a tree falls" })

client.on('authenticated', () => {
    console.log('Authenticated!')
    client.send({ blahblah: "hi server!" })
    // and/or
    client.request({ blahblah: "can I please have the user profile for id#40312321?" }, function(response) {
        console.log('and receive a specific response:', response)
    })
})

client.on('message', message => {
    console.log('Message from server', message)
})

client.on('close', () => {
    console.log('TLSClient connection closed')
})

client.on('error', err => {
    console.log('TLSClient connection error', err)
})

/*
setTimeout(() => {
    console.log('deliberately disconnecting...')
    client.disconnect()
}, 5000)
*/
```

The client needs the public cert for the server (not the key), a reconnectInterval, host, port, and password. A reconnectInterval of 0 will disable reconnecting. A reconnectInterval of 5000 will results in the client trying to connect every 5 seconds if the server goes down (or if the client cannot connect to begin with). Calls to send() will silently fail while the server is down. Clients will still attempt to reconnect even if their passwords are wrong.

The client can send messages to the server. The client can invoke disconnect to deliberately disconnect and this will cancel auto reconnection.
