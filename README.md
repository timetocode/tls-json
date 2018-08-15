# tls-json
A client and server that communicate over tls by sending json messages after verification of a password.

This library is designed to facilitate simple json server to server communication where one server acts as a central server. The client servers initiate the connection to the central server, and optionally will automatically reconnect if the central server is taken down. This allows for rebooting of either central or client servers, as they will discover each other when back online. 

The api allows for bidirectional communication and it is left to the user of this library to decide which end has the power.

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
The api is essentially the following events: `authenticated`, `close`, `error`, `message` where messages are javascript objects that were sent as JSON. The outgoing sections of the api are the functions `send` and `request`. Send blindly fires off a message, caring not what happens. Request sends a message and invokes a callback in a very traditional `err`, `req`, and `res` node style. The `res` object exists only so that `res.send(someObj)` can be invoked to give a response. The `err` object is null unless an request encountered an error. The `req` object is the message itself.

Client and server have a very similar api, with main difference being that the outgoing server calls take a client `id` as an argument (that's who the message goes to). The client on the other hand invokes `send` and `request` without an `id` because all of its messages can only go to the server.

## Server

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
    // always use res.send when answering a request
    res.send({ anything: 'this is a response to your request'}) 
})

server.listen(port, () => {
    console.log(`TLSServer listening on port ${port}`)
})

/* outgoing */
server.send(id, { any: message })
server.request(id, { any: message }, (err, res) => {
    console.log('err', err)
    console.log('res', res)
})
// and of course responding to requests is outgoing as well
```
A client's first message must contain a valid password or else they are disconnected. This is handled automatically by the client side of the api.

Clients are assigned an id when they connect, and their id is the first arg for all events. This id has no significance and is only unique for the lifetime of the server. To maintain a list of clients, save their ids when they authenticate, and then save any relevant data that they send. Remove the client when their connection closes or errors. If persistent state that can survive reboots of client+server is needed, then clients will need to have unique identifiers that they submit after authenticating -- in which case the regular `id` only identifies their current connection session.

## Client
```javascript
const fs = require('fs')
const TLSClient = require('tls-json').Client

const client = new TLSClient({
    // see: https://nodejs.org/api/tls.html for tls options
    options: {
        //cert: fs.readFileSync('localhost.crt'),       
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
    client.send({ mmhmm: 'thanks!' })
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

client.on('request', (req, res) => {
    res.send({ hello: 'kitty!' })
})

/* outgoing */
client.send({ any: message })
server.request({ any: message }, (err, res) => {
    console.log('err', err)
    console.log('res', res)
})
// and of course responding to requests is outgoing as well
```

Clients with a reconnectInterval > 0 will automatically attempt to reconnect to a server after losing connection. Clients will authenticate when they reconnect, and this handler is a good place to send initial state to the server.

## Errors
When attempting to send or request from either the client or the server, the following errors can be returned

* `NotConnectedError` - send was invoked before the connection was made or authenticated
* `RequestNotConnectedError` - request was invoked before the connection was made or authenticated
* `RequestConnectionLostError` - a request was sent, but then the connection was lost
* `RequestTimedOutError` - a request was sent, but the timeout elapsed before a response was received

In all cases the error contains an extra property called `originalMessage` containing the data that was not sent. For convenience the request-related errors come through the errback of the request api, whereas the NotConnectedError comes through the main error handler.
