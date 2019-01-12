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

The default configuration for this proxy will connect to `PlasmaChain` on `wss://plasma.dappchains.com` and serve the `HTTP` interface on port `8080`, however those values can be tweak by using environment variables as the following example:

```bash
yarn build;
PORT=80 CHAIN_ENDPOINT="ws://localhost:46658" node .
```

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

## Using with Remix

Also is possible to use [Remix](https://remix.ethereum.org), just select `Web3 Provider` on dropdown button `Environment` and set the host like `http://localhost:8080` and now you can use `Remix` to develop and test your `Solidity` smart contracts on `Loomchain`

> The current provider do not supports Remix debug mechanism