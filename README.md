# tls-json
A node.js client and server api for sending json over tls.

The api has bidirectional communication, allowing for a variety of types of services to be created.

Server and clients can be turned on or restarted in any order, and the client will attempt to reconnect to the server.

# Install
    npm install tls-json

# Usage


### Generate cert
```
openssl genrsa -out server-key.pem 4096
openssl req -new -key server-key.pem -out server-csr.pem
openssl x509 -req -in server-csr.pem -signkey server-key.pem -out server-cert.pem
```

### Generate localhost cert
```
# a dev env ~10 year cert, such as the one used in the example code below
openssl req -x509 -newkey rsa:4096 -sha256 -nodes -keyout localhost.key -out localhost.crt -subj "/CN=localhost" -days 3650
```

# General
The api is essentially the following events: `authenticated`, `close`, `error`, `message` where messages are javascript objects that were sent as JSON. The outgoing sections of the api are the functions `send` and `request`. Send blindly fires off a message, caring not what happens. Request sends a message and returns a promise that will resolve to the response. A simplified `request` and `response` pattern is used, where the `req` contains the data sent, and the `res` can be used to reply.

Client and server have a very similar api, with main difference being that the outgoing server calls take a client `id` as an argument (that's who the message goes to). The client on the other hand invokes `send` and `request` without an `id` because all of its messages can only go to the server.

## Server API

```javascript
const fs = require('fs')
const TLSServer = require('tls-json').Server

const port = 8888

const server = new TLSServer({
    // see: https://nodejs.org/api/tls.html for tls options
    options: {
        key:  fs.readFileSync('localhost.key'),
        cert: fs.readFileSync('localhost.crt'),
        rejectUnauthorized: true,
        requestTimeout: 30000 // optional, defaults to 10000 which is 10 seconds
    },
    password: 'this string is a password, change it'
})

// client connected and supplied password correctly
server.on('authenticated', (id, socket) => {
    console.log('authenticated', id, socket.remoteAddress)  
    // optional: save the client id if you wish to send them messages/requests 
})

// client closed connection
server.on('close', id => {
    console.log('connection closed', id)
})

// socket errors, disconnects, problems sending
server.on('error', (id, err) => {
    console.log('error', err, 'from', id)
})

// client sent a message
server.on('message', (id, message) => {
    console.log('message', message, 'from', id)
})

// client sent a request
server.on('request', (id, req, res) => {
    console.log('request', req, 'from', id)
    // always use res.send when answering a request, or it will timeout
    res.send({ anything: 'this is a response to your request'}) 
})

server.listen(port, () => {
    console.log(`TLSServer listening on port ${port}`)
})

/* outgoing examples */
// NOTE: to send anything we just refer to the client by id
server.send(id, { any: message })
server.request(id, { any: message })
    .then(data => {} )
    .catch (err => {} )
// or
try {
    const data = await server.request(id, { any: message })
} catch (err) {

}


// and of course responding to requests is outgoing as well
```
A client's first message must contain a valid password or else they are disconnected. This is handled automatically by the client side of the api.

Clients are assigned an id when they connect, and their id is the first arg for all events. This id can be used to send messages and requests to the clients. If a server never sends or requests anything from the clients, and only receives data or responds to requests, then we have behavior like a typical REST service (except its over tcp).

## Client API
```javascript
const fs = require('fs')
const TLSClient = require('tls-json').Client

const client = new TLSClient({
    // see: https://nodejs.org/api/tls.html for tls options
    options: {      
        ca: [fs.readFileSync('localhost.crt')]  // allows self-signed certs
    },    
    host: 'localhost',
    port: 8888,
    reconnectInterval: 2000, // in milliseconds
    requestTimeout: 5000, // optional, defaults to 10000 which is 10 seconds
    password: 'this string is a password, change it'
})

client.on('authenticated', () => {
    console.log('authenticated')
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

client.on('reconnectAttempt', () => {
    // invoked once per reconnect attempt, if you don't mind the spam
})

client.on('request', (req, res) => {
    res.send({ hello: 'kitty!' })
})

/* outgoing */
// NOTE: no id needed, the client only sends to the server
client.send({ any: message })
client.request({ any: message })
    .then(data => {})
    .catch(err => {})
//or
try {
    const data = await client.request({ some: 'thing' })
} catch (err) {

}

// and of course responding to requests is outgoing as well
```

Clients with a reconnectInterval > 0 will automatically attempt to reconnect to a server after losing connection. Clients will authenticate on their first connection and every reconnection.

## Errors
These are errors that can come through the error eventer handler, or through the request promises

* any socket errors such as `ECONNRESET`, or `ECONNREFUSED`, etc
* 'not connected or not authenticated' - when using `send` this is emitted if the client or server has not yet authenticated or is not connected, when using `request` this same error will come through the promise
* `request timeout` - when no response comes back within `requestTimeout`, most likely caused by forgetting to use `res.send()`
* `connection lost` - rare, but can occur if a request is made but the connection is lost before the other service can respond

For spam reasons when a client is in reconnect mode the `ECONNREFUSED` errors and socket `close` errors are suppressed. If you'd like to log how often reconnect attempts occur anyways, listen for `reconnectAttempt`.
