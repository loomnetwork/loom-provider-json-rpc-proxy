import http from 'http'
import ws from 'ws'
import debug from 'debug'
import { CryptoUtils, LoomProvider, Client, ClientEvent } from 'loom-js'
import { IEthRPCPayload } from 'loom-js/dist/loom-provider'

const log = debug('loom-provider-json-rpc-proxy')
const error = debug('loom-provider-json-rpc-proxy:error')

const CHAIN_ID = process.env.CHAIN_ID || 'default'

// Default chain
const CHAIN_ENDPOINT = process.env.CHAIN_ENDPOINT || 'wss://plasma.dappchains.com'

// Default port
const WS_PORT = process.env.WS_PORT || 8081

// Initialize Client and LoomProvider
const privateKey = CryptoUtils.generatePrivateKey()
const client = new Client(CHAIN_ID, `${CHAIN_ENDPOINT}/websocket`, `${CHAIN_ENDPOINT}/queryws`)
const loomProvider = new LoomProvider(client, privateKey)

// Loom Provider without vars out of the eth specification
loomProvider.strict = true

// Need to retry some calls because the indexer is a machine gun of calls per sec
loomProvider.retryStrategy.retries = 50
loomProvider.retryStrategy.minTimeout = 20000
loomProvider.retryStrategy.maxTimeout = 50000
loomProvider.retryStrategy.randomize = false
loomProvider.retryStrategy.forever = true

// Used by Remix https://remix.ethereum.org
loomProvider.addCustomMethod('net_listening', (payload: IEthRPCPayload) => true)

client.on(ClientEvent.Error, msg => {
  error('Error on client:', msg)
})

const processMessage = async (body: any, returnJSON: boolean = true) => {
  const objBody = JSON.parse(body)
  const result = await loomProvider.sendAsync(objBody)
  return returnJSON ? JSON.stringify(result, null, 2) : result
}

log(`Proxy calls from WS port ${WS_PORT} and connected to WS ${CHAIN_ENDPOINT}`)

const wss = new ws.Server({ noServer: true })

// Only to avoid the errors, but not responding ok
wss.on('connection', (ws: any) => {
  ws.on('message', async (message: any) => {
    log(`WS Message ${message}`)
    const payload = await processMessage(message)
    log(`WS Response ${payload}`)
    ws.send(payload)

    // This still not working completely
    loomProvider.on('data', (payload: any) => {
      // TODO: Not responding yet
      // ws.send(payload)
    })
  })
})

// Let's serve the Proxy
const server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Request-Method', '*')
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST')
  res.setHeader('Access-Control-Allow-Headers', '*')

  // POST is accepted otherwise BAD GATEWAY
  if (req.method === 'POST') {
    try {
      let body: any = ''

      req.on('data', chunk => {
        body += chunk.toString()
      })

      req.on('end', async () => {
        try {
          let bodyObj = JSON.parse(body)

          log(`HTTP Body ${JSON.stringify(bodyObj, null, 2)}`)

          // Ugly hack to remove array json rpc requests
          if (body.substr(0, 1) === '[') {
            bodyObj = bodyObj.shift()
            body = JSON.stringify(bodyObj)
          }

          const payload = await processMessage(body, false)

          if (bodyObj.method == 'eth_getBlockByNumber') {
            // Ugly hack to complete the needed info
            payload.result = Object.assign({}, payload.result, {
              difficulty: '0x01',
              gasLimit: '0x01',
              gasUsed: '0x01',
              size: '0x01',
              totalDifficulty: '0x01'
            })
          }

          const jsonPayload = JSON.stringify(payload, null, 2)

          log(`HTTP Response ${jsonPayload}`)

          res.end(jsonPayload)
        } catch (err) {
          console.error(err)
          res.statusCode = 500 // INTERNAL ERROR
          res.end(err.data ? err.data : err.message)
        }
      })
    } catch (err) {
      console.error(err)
      res.statusCode = 500 // INTERNAL ERROR
      res.end()
    }
  } else if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
  } else if (req.method === 'GET') {
    res.writeHead(200)
    res.end()
  } else {
    res.statusCode = 502 // BAD GATEWAY
    res.end()
  }
})

server.on('upgrade', (request, socket, head) => {
  log('Connection upgraded')
  wss.handleUpgrade(request, socket, head, function done(ws) {
    wss.emit('connection', ws, request)
  })
})

server.listen(WS_PORT, () => {
  log(`${new Date()} Server is listening on port ${WS_PORT}`)
})
