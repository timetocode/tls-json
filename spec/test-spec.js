const fs = require('fs')
const TLSServer = require('../Server')
const TLSClient = require('../Client')

function cleanUp(server, client, done) {
    client.on('close', () => {
        server.close(() => {
            done()
        })
    })
    client.disconnect()
}

describe('tests', () => {
    const port = 8890
    let serverConfig
    let clientConfig
    beforeEach(() => {
        serverConfig = {
            options: {
                key: fs.readFileSync('./spec/localhost.key'),
                cert: fs.readFileSync('./spec/localhost.crt'),
                rejectUnauthorized: true,
            },
            password: 'password',
            requestTimeout: 10000
        }

        clientConfig = {
            options: {
                ca: [fs.readFileSync('./spec/localhost.crt')] // allows self-signed certs
            },
            password: 'password',
            host: 'localhost',
            port: port,
            reconnectInterval: 2000,
            requestTimeout: 5000
        }
        /*
        server = new TLSServer({
            options: {
                key: fs.readFileSync('./spec/localhost.key'),
                cert: fs.readFileSync('./spec/localhost.crt'),
                rejectUnauthorized: true,
                requestTimeout: 10000
            },
            password: 'password'
        })
        server.on('authenticated', (id, socket) => { })
        server.on('close', id => { })
        server.on('error', (id, err) => { })
        server.on('message', (id, message) => { })
        server.on('request', (id, req, res) => { res.send({}) })
        server.listen(port, () => { })

        client = new TLSClient({
            options: {   
                ca: [fs.readFileSync('./spec/localhost.crt')]  // allows self-signed certs
            },
            host: 'localhost',
            port: 8888,
            reconnectInterval: 2000, 
            requestTimeout: 5000,
            password: 'password'
        })

        client.on('authenticated', () => { console.log('here')})
        client.on('message', message => { })
        client.on('close', () => { })
        client.on('error', err => { })
        client.on('request', (req, res) => { res.send({}) })
        */

    })


    it('Can initialize, connect, and authenticate', (done) => {
        const spy = {
            serverAuthenticated: function (id, socket) { },
            clientAuthenticated: function () { }
        }
        spyOn(spy, 'serverAuthenticated')
        spyOn(spy, 'clientAuthenticated')

        const server = new TLSServer(serverConfig)

        server.on('authenticated', (id, socket) => {
            spy.serverAuthenticated()
        })

        server.listen(port, () => {
            const client = new TLSClient(clientConfig)
            client.on('authenticated', () => {
                spy.clientAuthenticated()
                expect(spy.serverAuthenticated).toHaveBeenCalled()
                expect(spy.clientAuthenticated).toHaveBeenCalled()

                cleanUp(server, client, done)
            })
        })
    })

    it('fails on incorrect password', (done) => {
        serverConfig.password = '12345'
        clientConfig.password = '54321'
        const spy = {
            serverAuthenticated: function (id, socket) { },
            clientAuthenticated: function () { },
            clientReceiveMessage: function (message) { },
        }
        spyOn(spy, 'serverAuthenticated')
        spyOn(spy, 'clientAuthenticated')
        spyOn(spy, 'clientReceiveMessage')

        const server = new TLSServer(serverConfig)

        server.on('authenticated', (id, socket) => {
            spy.serverAuthenticated()
        })

        server.listen(port, () => {
            const client = new TLSClient(clientConfig)
            client.on('message', (message) => {
                spy.clientReceiveMessage(message)
                expect(message.error).toBe('incorrect password')
                expect(spy.clientReceiveMessage).toHaveBeenCalled()
                expect(spy.serverAuthenticated).not.toHaveBeenCalled()
                expect(spy.clientAuthenticated).not.toHaveBeenCalled()

                cleanUp(server, client, done)
            })
        })
    })

    it('server can make request to client', (done) => {
        const spy = {
            clientReceiveRequest: function (req, res) { },
            serverReceiveResponse: function (data) { },
        }
        spyOn(spy, 'clientReceiveRequest')
        spyOn(spy, 'serverReceiveResponse')

        let clientId = null

        const server = new TLSServer(serverConfig)

        server.on('authenticated', (id, socket) => {
            clientId = id
        })

        server.listen(port, () => {
            const client = new TLSClient(clientConfig)

            client.on('request', (req, res) => {
                spy.clientReceiveRequest(req, res)
                expect(req).toEqual({ foo: 'bar' })
                res.send({ bar: 'qux' })
            })

            client.on('authenticated', () => {
                server.request(clientId, { foo: 'bar' }).then(data => {
                    spy.serverReceiveResponse(data)
                    expect(spy.clientReceiveRequest).toHaveBeenCalled()
                    expect(spy.serverReceiveResponse).toHaveBeenCalledWith({ bar: 'qux' })

                    cleanUp(server, client, done)
                })
            })
        })
    })

    it('only the first response is valid', (done) => {
        const spy = {
            serverReceiveResponse: function (data) { },
        }
        spyOn(spy, 'serverReceiveResponse')

        let clientId = null

        const server = new TLSServer(serverConfig)

        server.on('authenticated', (id, socket) => {
            clientId = id
        })

        server.listen(port, () => {
            const client = new TLSClient(clientConfig)

            client.on('request', (req, res) => {
                res.send({ bar: 'qux' })
                res.send({ bar: 'qux2' })
            })

            client.on('authenticated', () => {
                server.request(clientId, { foo: 'bar' }).then(data => {
                    spy.serverReceiveResponse(data)
                    expect(spy.serverReceiveResponse).toHaveBeenCalledWith({ bar: 'qux' })
                    expect(spy.serverReceiveResponse).not.toHaveBeenCalledWith({ bar: 'qux2' })

                    cleanUp(server, client, done)
                })
            })
        })
    })

    it('client can make request to server', (done) => {
        const spy = {
            serverReceiveRequest: function (id, req, res) { },
            clientReceiveResponse: function (data) { },
        }
        spyOn(spy, 'serverReceiveRequest')
        spyOn(spy, 'clientReceiveResponse')

        const server = new TLSServer(serverConfig)

        server.on('request', (id, req, res) => {
            spy.serverReceiveRequest(id, req, res)
            expect(req).toEqual({ foo: 'bar' })
            res.send({ bar: 'qux' })
        })

        server.listen(port, () => {
            const client = new TLSClient(clientConfig)

            client.on('authenticated', () => {
                client.request({ foo: 'bar' }).then(data => {
                    spy.clientReceiveResponse(data)
                    expect(spy.serverReceiveRequest).toHaveBeenCalled()
                    expect(spy.clientReceiveResponse).toHaveBeenCalledWith({ bar: 'qux' })

                    cleanUp(server, client, done)
                })
            })
        })
    })

    it('client error making request before connected', (done) => {
        const client = new TLSClient(clientConfig)
        client.request({ foo: 'bar' })
            .then(data => {
                // not gonna happen
            })
            .catch(err => {
                done()
            })
    })

    it('client error timeout', (done) => {
        const server = new TLSServer(serverConfig)

        server.on('request', (id, req, res) => {
            // not responding -- will cause a timeout
        })
        server.listen(port, () => {
            // reducing timeout so that the api times out before the jasmine test timesout
            clientConfig.requestTimeout = 500
            const client = new TLSClient(clientConfig)

            client.on('authenticated', () => {
                server.close()
                client.request({ foo: 'bar' })
                    .then(data => {
                        // not gonna happen
                    }).catch(err => {
                        expect(err).toEqual(new Error('request timeout'))
                        cleanUp(server, client, done)
                    })
            })
        })
    })
    

    it('server can send to client', (done) => {
        const spy = {
            clientReceiveMessage: function (data) { }
        }
        spyOn(spy, 'clientReceiveMessage')

        let clientId = null

        const server = new TLSServer(serverConfig)

        server.on('authenticated', (id, socket) => {
            clientId = id
        })

        server.listen(port, () => {
            const client = new TLSClient(clientConfig)

            client.on('message', data => {
                spy.clientReceiveMessage(data)
                expect(spy.clientReceiveMessage).toHaveBeenCalledWith({ foo: 'bar'})
                cleanUp(server, client, done)
            })

            client.on('authenticated', () => {
                server.send(clientId, { foo: 'bar' })
            })
        })
    })

    it('client can send to server', (done) => {
        const spy = {
            serverReceiveMessage: function (id, data) { }
        }
        spyOn(spy, 'serverReceiveMessage')

        let clientId = null

        const server = new TLSServer(serverConfig)

        server.on('authenticated', (id, socket) => {
            clientId = id
        })

        let client = null
        server.on('message', (id, data) => {
            spy.serverReceiveMessage(id, data)
            expect(spy.serverReceiveMessage).toHaveBeenCalledWith(clientId, { foo: 'bar'})
            cleanUp(server, client, done)
        })

        server.listen(port, () => {
            client = new TLSClient(clientConfig)
            client.on('authenticated', () => {
                client.send({ foo: 'bar' })
            })
        })
    })

    it('a client will reconnect after a server restart', (done) => {
        const spy = {
            serverAuthenticated: function (id, socket) { },
            clientAuthenticated: function () { },
            clientAuthenticatedAgain: function () { }
        }
        spyOn(spy, 'serverAuthenticated')
        spyOn(spy, 'clientAuthenticated')
        spyOn(spy, 'clientAuthenticatedAgain')

        const server = new TLSServer(serverConfig)

        server.on('authenticated', (id, socket) => {
            spy.serverAuthenticated()
        })

        server.listen(port, () => {
            clientConfig.reconnectInterval = 5
            const client = new TLSClient(clientConfig)
            client.on('error', error => {
                //console.log('error', error)
            })
            client.on('reconnectAttempt', () => {
                //console.log('trying to reconnect...')
            })
            client.on('authenticated', () => {
                spy.clientAuthenticated()
                //console.log('auth once')
                server.close(() => {
                    //console.log('server closed')
                    server.listen(port, () => {
                        client.on('authenticated', () => {
                            spy.clientAuthenticatedAgain()
                            expect(spy.clientAuthenticatedAgain).toHaveBeenCalled()
                            cleanUp(server, client, done)
                        })
                    })
                })
                // HACKY: we must disconnect before server close will actually do anything
                // so to simulate a reboot, we disconnect the client which allows the server to close
                // normally disconnecting the client stops the client from attempting to automatically reconnect
                // but attemptsToReconnect being set to true will restore it to its normal behavior
                client.disconnect()
                client.attemptsToReconnect = true 
            })
        })
    })
})
