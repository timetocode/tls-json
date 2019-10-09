const fs = require('fs')

module.exports = {
    port: 9966,
    key: fs.readFileSync('../localhost.key'),
    cert: fs.readFileSync('../localhost.crt'),
    password: 'password'
}