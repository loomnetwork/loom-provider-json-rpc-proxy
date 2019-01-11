import http from 'http'
import { CryptoUtils, LoomProvider, Client, ClientEvent } from 'loom-js'

// Default chain
const chainEndpoint = process.env.CHAIN_ENDPOINT || 'wss://plasma.dappchains.com'

// Default port
const port = process.env.PORT || 8080

// Initialize Client and LoomProvider
const privateKey = CryptoUtils.generatePrivateKey()
const client = new Client('default', `${chainEndpoint}/websocket`, `${chainEndpoint}/queryws`)
const loomProvider = new LoomProvider(client, privateKey)

client.on(ClientEvent.Error, msg => {
  console.error('Error on client:', msg)
})

console.log(`Proxy calls from HTTP port ${port} to WS ${chainEndpoint}`)

// Let's serve the Proxy
http
  .createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
    // POST is accepted otherwise BAD GATEWAY
    if (req.method === 'POST') {
      try {
        let body = ''

        req.on('data', chunk => {
          body += chunk.toString()
        })

        req.on('end', async () => {
          // Proxy JSON RPC to LoomProvider
          const result = await loomProvider.sendAsync(JSON.parse(body))
          res.end(JSON.stringify(result))
        })
      } catch (err) {
        console.error(err)
        res.statusCode = 500 // INTERNAL ERROR
        res.end()
      }
    } else if (req.method === 'OPTIONS') {
      // Set CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Request-Method', '*')
      res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST')
      res.setHeader('Access-Control-Allow-Headers', '*')
      res.writeHead(200)
      res.end()
    } else {
      res.statusCode = 502 // BAD GATEWAY
      res.end()
    }
  })
  .listen(port)
