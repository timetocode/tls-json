const TLSClient = require('../../Client')
const config = require('./config')

const client = new TLSClient({
    options: {
        ca: [config.cert]  // allows self-signed certs
    },
    host: 'localhost',
    port: config.port,
    reconnectInterval: 2000,
    requestTimeout: 5000,
    password: config.password
})

client.on('authenticated', () => { 
    console.log('adhoc test TLSClient authenticated') 
})

client.on('message', message => {
    console.log('message', message)
})

client.on('close', () => {
    console.log('close')
})

client.on('error', err => {
    console.log('error', err)
})

client.on('request', (req, res) => {
    console.log('rec request', req)
    res.send({})
})
