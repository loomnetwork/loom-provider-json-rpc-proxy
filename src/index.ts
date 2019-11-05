import http from 'http'
import {
  CryptoUtils,
  LoomProvider,
  Client,
  ClientEvent,
  LocalAddress,
  Address,
  Contracts,
  NonceTxMiddleware,
  SignedTxMiddleware
} from 'loom-js'
import { IEthRPCPayload } from 'loom-js/dist/loom-provider'
import Web3 from 'web3'
import { OfflineWeb3Signer } from 'loom-js/dist/solidity-helpers'

const AddressMapper = Contracts.AddressMapper

// Default chain id
const chainId = process.env.CHAIN_ID || 'default'

// Default chain
const chainEndpoint = process.env.CHAIN_ENDPOINT || 'wss://plasma.dappchains.com'

// Default port
const port = process.env.PORT || 8080

// Initialize Client and LoomProvider
const privateKeyLoom = CryptoUtils.generatePrivateKey()
const client = new Client(chainId, `${chainEndpoint}/websocket`, `${chainEndpoint}/queryws`)
const loomPublicKey = CryptoUtils.publicKeyFromPrivateKey(privateKeyLoom)
client.txMiddleware = [
  new NonceTxMiddleware(loomPublicKey, client),
  new SignedTxMiddleware(privateKeyLoom)
]
const loomProvider = new LoomProvider(client, privateKeyLoom)

// create Rinkeby address

const InfuraAPIkey = process.env.INFURA_API_KEY

const privateKeyRinkeby = CryptoUtils.generatePrivateKey()
const web3js = new Web3(`https://rinkeby.infura.io/v3/${InfuraAPIkey}`)
const ownerAccount = web3js.eth.accounts.privateKeyToAccount('0x' + privateKeyRinkeby)
web3js.eth.accounts.wallet.add(ownerAccount)

const rinkebyAddress = ownerAccount.address

// get Loom address

const loomAddress = LocalAddress.fromPublicKey(loomPublicKey).toString()

console.log(`Rinkeby address : ${rinkebyAddress}`)
console.log(`Loom address : ${loomAddress}`)

// mapping accounts

const signer = new OfflineWeb3Signer(web3js, ownerAccount)

async function mapAccounts(client, signer, ownerRinkebyAddress, ownerExtdevAddress) {
  const ownerRinkebyAddr = Address.fromString(`eth:${ownerRinkebyAddress}`)
  const ownerExtdevAddr = Address.fromString(`${client.chainId}:${ownerExtdevAddress}`)

  let mapperContract
  mapperContract = await AddressMapper.createAsync(client, ownerExtdevAddr)

  try {
    const mapping = await mapperContract.getMappingAsync(ownerExtdevAddr)
    console.log(`${mapping.from.toString()} is already mapped to ${mapping.to.toString()}`)
    return
  } catch (err) {
    // assume this means there is no mapping yet, need to fix loom-js not to throw in this case
  }
  console.log(`mapping ${ownerRinkebyAddr.toString()} to ${ownerExtdevAddr.toString()}`)

  try {
    await mapperContract.addIdentityMappingAsync(ownerExtdevAddr, ownerRinkebyAddr, signer)
  } catch (err) {
    console.log(err)
  }

  console.log(`Mapped ${ownerExtdevAddr} to ${ownerRinkebyAddr}`)
}

mapAccounts(client, signer, rinkebyAddress, loomAddress)

// Used by Remix https://remix.ethereum.org
loomProvider.addCustomMethod('net_listening', (payload: IEthRPCPayload) => true)

client.on(ClientEvent.Error, msg => {
  console.error('Error on client:', msg)
})

console.log(`Proxy calls from HTTP port ${port} to WS ${chainEndpoint}`)

// Let's serve the Proxy
http
  .createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Request-Method', '*')
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST')
    res.setHeader('Access-Control-Allow-Headers', '*')

    // POST is accepted otherwise BAD GATEWAY
    if (req.method === 'POST') {
      try {
        let body = ''

        req.on('data', chunk => {
          body += chunk.toString()
        })

        req.on('end', async () => {
          try {
            // Proxy JSON RPC to LoomProvider
            const result = await loomProvider.sendAsync(JSON.parse(body))
            res.end(JSON.stringify(result))
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
    } else {
      res.statusCode = 502 // BAD GATEWAY
      res.end()
    }
  })
  .listen(port)
