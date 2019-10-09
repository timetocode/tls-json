
const TLSServer = require('../../Server')
const config = require('./config')

const server = new TLSServer({
    options: {
        key: config.key,
        cert: config.cert,
        rejectUnauthorized: true
    },
    requestTimeout: 10000,
    keepAliveInterval: 10000,
    keepAliveTimeout: 5000,
    password: config.password
})

server.on('authenticated', (id, socket) => {
    console.log('authenticated a client', id)
})

server.on('close', id => {
    console.log('closed', id)
})

server.on('error', (id, err) => {
    console.log('error', id, err)
})

server.on('timeout', (id) => {
    console.log('timeout', id)
})

server.on('message', (id, message) => {
    console.log('message', id, message)
})

server.on('request', (id, req, res) => {
    console.log('request', id, req)
    res.send({})
})

server.listen(config.port, () => {
    console.log('adhoc test TLSServer running on port', config.port)
})
