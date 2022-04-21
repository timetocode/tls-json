# tls-json
A node.js client and server api for bidirectional sending of json over tls after exchanging a password.

When using a `reconnectInterval` on the client end of the api, clients will reconnect to a server if a connection is lost.

# Install
    npm install tls-json

# Usage


### Generate cert
```
openssl genrsa -out server-key.pem 2048
openssl req -new -key server-key.pem -out server-csr.pem
openssl x509 -req -in server-csr.pem -signkey server-key.pem -out server-cert.pem
```

### Generate localhost cert
```
# a dev env ~10 year cert, such as the one used in the example code below
openssl req -x509 -newkey rsa:2048 -sha256 -nodes -keyout localhost.key -out localhost.crt -subj "/CN=localhost" -days 3650
```

# General
The api is essentially the following events: `authenticated`, `close`, `error`, `message` where messages is a JavaScript object (send as JSON). The outgoing sections of the api are the functions `send` and `request`. Send will send a message, without any acknowledgement needed. Request sends a message and returns a promise that will resolve to the response -- in other words requests are acknowledged and the sender can be sure that they were received. A simplified `request` and `response` pattern is used, where the `req` contains the data sent, and the `res` can be used to reply.

Client and server have essentially the same api for communication, with main difference being that the outgoing server calls take a client `id` as an argument (that's who the message goes to). The client on the other hand invokes `send` and `request` without an `id` because all of its messages can only go to the server.

## Changes
* 3.2.0 - A keepalive ping/pong have been added (works automatically, no api changes, but configurable if desired).
* 3.3.0
    * fixed a bug where a client with a flickering connection could stop attempting to reconnect (occurred specifically if the client reconnected and then lost connection twice within the "reconnectInterval" timeframe)
    * added jasmine (dev dependency)

## Server API

```javascript
const fs = require('fs')
const TLSServer = require('tls-json').Server

const port = 8888

const server = new TLSServer({
    // this is a tls options object, see https://nodejs.org/api/tls.html
    options: {
        key:  fs.readFileSync('localhost.key'),
        cert: fs.readFileSync('localhost.crt'),
        rejectUnauthorized: true
    },
    requestTimeout: 10000, // milliseconds until a request is considered timedout
    keepAliveInterval: 10000, // millisecond interval fequency to ping sockets
    keepAliveTimeout: 5000 // milliseconds until a socket is considered dead if it hasn't responded
    password: 'this string is a password, change it' // password clients must supply
})

// client connected and supplied password correctly
server.on('authenticated', (id, socket) => {
    console.log('authenticated', id, socket.remoteAddress)
})

// client closed connection
// gauranteed to fire if a client disconnects, timeouts, etc
server.on('close', id => {
    console.log('connection closed', id)
})

// client sent a message
server.on('message', (id, message) => {
    console.log('message', message, 'from', id)
})

// client sent a request
server.on('request', (id, req, res) => {
    console.log('request', req, 'from', id)
    // like node, always use res.send when answering a request
    res.send({ anything: 'this is a response to your request'}) 
})

// note: close will always fire if there is a problem, so error and
// timeout are merely for information/debugging
server.on('error', (id, err) => {
    console.log('error', err, 'from', id)
})
server.on('timeout', (id) => {
    console.log('timeout', id)
})

server.listen(port, () => {
    console.log(`TLSServer listening on port ${port}`)
})

/* outgoing examples */
// NOTE: to send anything we just refer to the client by id
server.send(id, { hello: 'world' })
server.request(id, { hello: 'world' })
    .then(data => {} )
    .catch (err => {} )
// or
try {
    const data = await server.request(id, { hello: 'world' })
} catch (err) {

}
// and of course responding to requests is outgoing as well
```
Clients are assigned an id when they connect, and their id is the first arg for all events. This id can be used to send messages and requests to the clients..

## Client API
```javascript
const fs = require('fs')
const TLSClient = require('tls-json').Client

const client = new TLSClient({
    // see: https://nodejs.org/api/tls.html for tls options
    options: {      
        ca: [fs.readFileSync('localhost.crt')]  // example allows self-signed certs
    },    
    host: 'localhost',
    port: 8888,
    reconnectInterval: 5000, // (in milliseconds) if set to 0, will not attempt to reconnect
    requestTimeout: 10000,
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

// informational
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
```

Clients with a reconnectInterval > 0 will automatically attempt to reconnect to a server after losing connection. Clients will *not* automatically send messages that failed to send prior to losing connection (though the api provides enough information to figure out which these are should you wish to resend them).

## Errors
These are errors that can come through the error event handler, or through the request promises

* any and all underlying socket errors such as `ECONNRESET`, or `ECONNREFUSED`, etc
* 'not connected or not authenticated' - when using `send` this is emitted if the client or server has not yet authenticated or is not connected, when using `request` this same error will come through the promise
* `request timeout` - when no response comes back within `requestTimeout`

For spam reasons when a client is in reconnect mode the `ECONNREFUSED` errors and socket `close` errors are suppressed until a valid connection is resumed. If you'd like to log how often reconnect attempts occur anyways, listen for `reconnectAttempt`.

