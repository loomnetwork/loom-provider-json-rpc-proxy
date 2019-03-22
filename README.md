# Loom Provider JSON RPC Proxy

Small service that proxies `JSON RPC` calls to the `Loomchain/EVM`

## Running

```bash
yarn build
node .
```

## Usage

```bash
yarn build; node .
```

The default configuration for this proxy will connect to `PlasmaChain` on `wss://plasma.dappchains.com` and serve the `HTTP/WS` interface on port `8081`, however those values can be tweaked by using environment variables as the following example:

```bash
yarn build;
CHAIN_ID=mychain WS_PORT=80 CHAIN_ENDPOINT="ws://localhost:46658" node .
```

Options:

* **WS_PORT**: It's the port of http/ws for JSON RPC requests
* **CHAIN_ID**: Configures the chain id name, each chain has an id, being default the default id
* **CHAIN_ENDPOINT**: And finally the address of the loomchain endpoint

It's possible to debug calls by adding the env var `DEBUG=loom-provider-json-rpc-proxy`

## Testing

```bash
curl -X POST --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' localhost:8080 | jq

# Result should be like
# {
# "id": 1,
#  "jsonrpc": "2.0",
#  "result": "1578251"
# }
```

```bash
curl -v -X POST --data '{"jsonrpc":"2.0","method":"eth_getBlockByNumber","params":["0x1b4", true],"id":1}' localhost:8080 | jq

# Result should be like
# {
#   "id": 1,
#   "jsonrpc": "2.0",
#   "result": {
#     "blockNumber": "0x1b4",
#     "transactionHash": "0x0423774be3b040400f000b200b6d7ec948a0fe48bec232b5f196e2fdb2b20859",
#     "parentHash": "0x2f85af1a1dc4285510ef84204b4487bef28e2838a3e2f1dea3943bf71c063c28",
#     "logsBloom": "0x",
#     "timestamp": 1536307493,
#     "transactions": [],
#     "gasLimit": "0x0",
#     "gasUsed": "0x0",
#     "size": "0x0",
#     "number": "0x0"
#   }
# }
```

## Dockerize

Another option is to use the Docker version by build the docker image and run like

Build an image

```bash
docker build -t loom-provider-json-rpc-proxy .
```

Then

```bash
docker run -p 8545:8545 -e DEBUG=loom-provider-json-rpc-proxy -e WSPORT=8545 -e CHAIN_ENDPOINT=ws://192.168.100.23:46658 loom-provider-json-rpc-proxy
```

## Using with Remix

Also is possible to use [Remix](https://remix.ethereum.org)

> The current provider do not supports Remix debug mechanism

### Example of Remix usage

```bash
# Start a local Loomchain
loom init -f
loom run
```

```bash
# On a second terminal start this tool
yarn build;
PORT=8545 CHAIN_ENDPOINT="ws://localhost:46658" node .
```

On a web browser access the [Remix](https://remix.ethereum.org), click on tab `Run` and select `Web3 Provider` on dropdown button `Environment` and set the host to `http://localhost:8545` and now you can use `Remix` to develop and test your `Solidity` smart contracts on `Loomchain`
