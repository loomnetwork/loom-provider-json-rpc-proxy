import http from 'http'
import ws from 'ws'
import debug from 'debug'
import crypto from 'crypto'
import { CryptoUtils, LoomProvider, Client, ClientEvent } from 'loom-js'
import { IEthRPCPayload } from 'loom-js/dist/loom-provider'

const log = debug('loom-provider-json-rpc-proxy')
const error = debug('loom-provider-json-rpc-proxy:error')

// Default chain
const CHAIN_ENDPOINT = process.env.CHAIN_ENDPOINT || 'wss://plasma.dappchains.com'

// Default port
const WS_PORT = process.env.WSPORT || 8081

// Initialize Client and LoomProvider
const privateKey = CryptoUtils.generatePrivateKey()
const client = new Client('default', `${CHAIN_ENDPOINT}/websocket`, `${CHAIN_ENDPOINT}/queryws`)
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

let number = 0

const randomValueHex = (len: number) => {
  return crypto
    .randomBytes(Math.ceil(len / 2))
    .toString('hex') // convert to hexadecimal format
    .slice(0, len) // return required number of characters
}

let parentHash = `0x${randomValueHex(64)}`

let transactionsOnBlock: any = {}

// Ugly hack to fix block 0 support
const getBlockZero = (id: any) => {
  const r = {
    id,
    jsonrpc: '2.0',
    result: {
      number: '0x0',
      hash: '0x627f66a4224d1e76fe3615bb682438967a9bf7f8f5127696e8418cdaa46cb306',
      parentHash: `0x${randomValueHex(64)}`,
      mixHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
      nonce: '0x0000000000000000',
      sha3Uncles: '0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347',
      logsBloom:
        '0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
      transactionsRoot: '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
      stateRoot: '0x0600e7a20ba07336907077114036d91a8de1c1c4d3e646faff642044a8dd16b2',
      receiptsRoot: '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
      miner: '0x0000000000000000000000000000000000000000',
      difficulty: '0x01',
      totalDifficulty: '0x01',
      extraData: '0x01',
      size: '0x03e8',
      gasLimit: '0x429ebf98',
      gasUsed: '0x01',
      timestamp: '0x5c91580a',
      transactions: [],
      uncles: []
    }
  }

  return Promise.resolve(r)
}

const processMessage = async (body: any, returnJSON: boolean = true) => {
  const objBody = JSON.parse(body)

  if (objBody.method === 'eth_subscribe') {
    number++
  }

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
      payload.params.result = Object.assign({}, payload.params.result, {
        // blockNumber: `${parseInt(payload.params.result.blockNumber)}`,
        hash: payload.params.result.parentHash,
        parentHash: '0x0',
        miner: '0xB3B1ab0A0531C59E97adcC2c0067c84031f57CEF',
        stateRoot: '0x0',
        transactionsRoot: '0x0',
        receiptsRoot: '0x0',
        timestamp: '0x5c915570',
        nonce: '0x0000000000000000',
        extraData: '0x0',
        number: `0x${parseInt(`${number}}`, 16)}`,
        difficulty: '0x0',
        gasLimit: '0x0',
        gasUsed: '0x0',
        size: '0x0',
        totalDifficulty: '0x0'
      })

      const jsonPayload = JSON.stringify(payload, null, 2)
      log('Notification callback', jsonPayload)
      ws.send(jsonPayload)
    })
  })
})

// Let's serve the Proxy
const server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
  log('Received request for ---------->', req.url)

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
          let isArray = false
          let bodyObj = JSON.parse(body)

          // Ugly hack to remove array json rpc requests
          if (body.substr(0, 1) === '[') {
            isArray = true
            bodyObj = bodyObj.shift()
            body = JSON.stringify(bodyObj)
          }

          log(`HTTP Body ${JSON.stringify(bodyObj, null, 2)}`)

          let payload: any

          // Workaround to get block 0
          if (bodyObj.method === 'eth_getBlockByNumber' && bodyObj.params[0] == '0x0') {
            payload = await getBlockZero(bodyObj.id)
          } else {
            payload = await processMessage(body, false)
          }

          if (bodyObj.method == 'eth_getBlockByNumber') {
            const transactions = transactionsOnBlock[bodyObj.hash] || []

            // Ugly hack to complete the needed info
            payload.result = Object.assign({}, payload.result, {
              // Fixed miner or error on explorer
              miner: '0xB3B1ab0A0531C59E97adcC2c0067c84031f57CEF',
              difficulty: '0x01',
              gasLimit: '0x01',
              gasUsed: '0x01',
              size: '0x01',
              totalDifficulty: '0x01',
              timestamp: '0x54e34e8e',
              transactions
            })
          }

          // Ugly hack to cache the tx info to patch something missing on tx info form chain
          if (bodyObj.method == 'eth_getTransactionReceipt') {
            bodyObj.result.logs.forEach((log: any) => {
              transactionsOnBlock[log.blockHash] = log
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
