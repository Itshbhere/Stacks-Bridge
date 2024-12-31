// Import Solana Web3.js library
const { Connection, PublicKey, clusterApiUrl } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');

// Configure your Solana account public key and the cluster
const MY_PUBLIC_KEY = new PublicKey('<YOUR_SOLANA_ACCOUNT_PUBLIC_KEY>');
const connection = new Connection(clusterApiUrl('mainnet-beta'), 'confirmed');

(async () => {
    console.log(`Listening for token transfers to ${MY_PUBLIC_KEY.toBase58()}...`);

    // Subscribe to changes on accounts owned by the SPL Token Program
    connection.onProgramAccountChange(
        TOKEN_PROGRAM_ID,
        async (info) => {
            try {
                const accountInfo = info.accountInfo;
                const owner = new PublicKey(accountInfo.data.slice(32, 64));

                // Check if the token account belongs to your public key
                if (owner.equals(MY_PUBLIC_KEY)) {
                    const tokenAddress = info.accountId.toBase58();

                    console.log('Token transfer detected:', {
                        tokenAccount: tokenAddress,
                        owner: owner.toBase58(),
                        lamports: accountInfo.lamports,
                    });
                }
            } catch (error) {
                console.error('Error processing account change:', error);
            }
        },
        'confirmed'
    );
})();
