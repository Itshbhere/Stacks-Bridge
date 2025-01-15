import { generateWallet, getPrivateKeyFromMnemonic } from "@stacks/encryption";
import { openSTXTransfer } from "@stacks/connect";
const seedPhrase =
  "top find mean better item trim orphan dolphin cart remain nation leaf caught fatal fiscal want nominee dinner task scan final bench blame degree";

async function generateAndExtractPrivateKey() {
  // Generate the wallet object
  const wallet = await generateWallet({
    secretKey: seedPhrase,
    password: "", // Optional, add password for encryption if needed
  });

  // Extract the private key for the default account
  const privateKey = getPrivateKeyFromMnemonic(wallet.accounts[0].mnemonic);

  console.log("Private Key:", privateKey);
}

generateAndExtractPrivateKey();
