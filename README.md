# Solana-Stacks Token Bridge

A bi-directional token bridge implementation enabling token transfers between Solana and Stacks blockchains. This bridge monitors token movements on Solana and facilitates corresponding transfers on the Stacks network, providing a seamless cross-chain token transfer experience.

## Features

- Real-time monitoring of Solana token transfers
- Automated corresponding token minting/transfers on Stacks
- Queue-based transfer processing with retry mechanisms
- Support for custom token contracts
- Interactive transfer mode for manual operations
- Robust error handling and transaction verification

## Prerequisites

- Node.js (v14 or higher)
- Solana CLI tools
- Stacks CLI tools
- Active Solana DevNet account
- Active Stacks TestNet account

## Installation

1. Clone the repository:

```bash
[git clone [repository-url]](https://github.com/Itshbhere/SPL-Token)
cd solana-stacks-bridge
```

2. Install dependencies:

```bash
npm install
```

3. Create configuration files:
   - `my-solana-wallet.json`: Your Solana wallet keypair
   - `token-info.json`: Token contract information

## Configuration

### Environment Setup

The bridge requires several configuration parameters:

```javascript
{
  solanaWalletAddress: "your-solana-wallet-address",
  solanaTokenMintAddress: "your-token-mint-address",
  stacksPrivateKey: "your-stacks-private-key",
  stacksContractAddress: "your-stacks-contract-address",
  stacksContractName: "your-contract-name"
}
```

### Required Files

1. `token-info.json`:

```json
{
  "mintAddress": "your-token-mint-address"
}
```

2. `my-solana-wallet.json`: Contains your Solana wallet keypair (keep secure)

## Architecture

### Components

1. **TokenBridge Class (`SplToStxBridge.js`)**

   - Handles Solana token monitoring
   - Manages transfer queue
   - Executes Stacks transfers

2. **DualTokenTransfer Class (`Bridge.js`)**
   - Manages bi-directional transfers
   - Handles interactive transfer mode
   - Provides balance checking utilities

### Flow Diagram

1. Solana Token Transfer Detection:

   ```
   Token Transfer → Monitor Detection → Queue Addition → Stacks Transfer
   ```

2. Bi-directional Transfer:
   ```
   User Input → Validation → Stacks Transfer → Verification → Solana Transfer
   ```

## Usage

### Automated Bridge Mode

```javascript
const bridge = new TokenBridge({
  solanaWalletAddress: "your-address",
  solanaTokenMintAddress: "your-token-mint",
  stacksPrivateKey: "your-private-key",
  stacksContractAddress: "your-contract-address",
  stacksContractName: "your-contract-name",
});

await bridge.initialize();
```

### Interactive Transfer Mode

Run the interactive transfer script:

```bash
node Bridge.js
```

Follow the prompts to:

1. Enter Stacks recipient address
2. Enter Solana recipient address
3. Enter transfer amount

## Security Considerations

1. **Private Key Management**

   - Store private keys securely
   - Never commit private keys to version control
   - Use environment variables for sensitive data

2. **Transaction Verification**

   - Implement proper transaction confirmation checks
   - Verify balances before transfers
   - Handle failed transactions appropriately

3. **Rate Limiting**
   - Built-in delays between transfers
   - Queue-based processing to prevent overload

## Error Handling

The bridge implements comprehensive error handling:

1. **Transaction Failures**

   - Automatic retry mechanism
   - Queue reintegration for failed transfers
   - Configurable retry attempts

2. **Network Issues**

   - Connection error handling
   - Automatic reconnection attempts
   - Timeout handling

3. **Invalid Inputs**
   - Address validation
   - Balance verification
   - Amount validation

## Monitoring and Maintenance

### Logging

The bridge provides detailed logging:

- Transaction details
- Error messages
- Balance updates
- Queue status

### Health Checks

Monitor:

- Connection status
- Queue processing
- Transaction confirmations
- Balance reconciliation

## Development and Testing

### Local Testing

1. Set up local environment:

```bash
npm install
```

2. Configure test networks:

   - Solana DevNet
   - Stacks TestNet

3. Run tests:

```bash
npm test
```

### Deployment

1. Update configuration for production:

   - Network endpoints
   - Contract addresses
   - Security parameters

2. Deploy monitoring system
3. Set up logging infrastructure
4. Configure alerts

## Troubleshooting

Common issues and solutions:

1. **Connection Failures**

   - Verify network endpoints
   - Check API keys
   - Confirm network status

2. **Transaction Errors**

   - Verify balance sufficiency
   - Check gas fees
   - Confirm address validity

3. **Queue Issues**
   - Monitor queue length
   - Check processing status
   - Verify retry mechanism

## Contributing

1. Fork the repository
2. Create feature branch
3. Submit pull request
4. Follow coding standards
5. Include tests

## License

[Specify License]

## Support

For support:

- Create GitHub issue
- Contact maintainers
- Check documentation

## Acknowledgments

- Solana team
- Stacks team
- Community contributors
