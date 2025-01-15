import React, { useState, useEffect } from "react";
import { AppConfig, UserSession, showConnect } from "@stacks/connect";
import { STACKS_TESTNET, STACKS_MAINNET } from "@stacks/network";
import {
  standardPrincipalCV,
  fetchCallReadOnlyFunction,
} from "@stacks/transactions";

// Configure the app
const appConfig = new AppConfig(["store_write", "publish_data"]);
const userSession = new UserSession({ appConfig });
const network = STACKS_MAINNET;

// Your deployed contract details
const TOKEN_CONTRACT = {
  address: "SP1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H2SAZ7CN",
  name: "Krypto",
  tokenName: "krypt-token",
};

function App1() {
  const [userData, setUserData] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [tokenBalance, setTokenBalance] = useState(null);

  useEffect(() => {
    if (userSession.isSignInPending()) {
      userSession.handlePendingSignIn().then((userData) => {
        setUserData(userData);
        setIsConnected(true);
        checkTokenBalance(TOKEN_CONTRACT.address);
      });
    } else if (userSession.isUserSignedIn()) {
      const userData = userSession.loadUserData();
      setUserData(userData);
      setIsConnected(true);
      checkTokenBalance(TOKEN_CONTRACT.address);
    }
  }, []);

  const connectWallet = () => {
    showConnect({
      userSession,
      appDetails: {
        name: "Token Balance App",
        icon: window.location.origin + "/logo.svg",
      },
      onFinish: () => {
        const userData = userSession.loadUserData();
        setUserData(userData);
        setIsConnected(true);
        checkTokenBalance(userData.profile.stxAddress.testnet);
      },
      onCancel: () => {
        console.log("Connection canceled");
      },
    });
  };

  const disconnectWallet = () => {
    userSession.signUserOut();
    setUserData(null);
    setIsConnected(false);
    setTokenBalance(null);
  };

  const checkTokenBalance = async (address) => {
    if (!address) {
      alert("No address available");
      return;
    }

    try {
      const network = STACKS_MAINNET;

      const options = {
        contractAddress: TOKEN_CONTRACT.address,
        contractName: TOKEN_CONTRACT.name,
        functionName: "get-balance",
        functionArgs: [standardPrincipalCV(address)],
        network,
        senderAddress: address, // Use the same address as sender
      };

      console.log("Checking token balance...", options);

      const result = await fetchCallReadOnlyFunction(options);

      // Parse the result based on your contract's return type
      console.log("Balance result:", result);

      // Assuming the contract returns an 'ok' response with the balance
      if (result && result.value) {
        setTokenBalance(result.value.toString());
      } else {
        setTokenBalance("0");
      }
    } catch (error) {
      console.error("Error checking token balance:", {
        name: error.name,
        message: error.message,
        stack: error.stack,
        details: JSON.stringify(error, null, 2),
      });

      alert(`Failed to check token balance: ${error.message}`);
      setTokenBalance("Unable to retrieve balance");
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold mb-6 text-center">
          Stacks Token Balance
        </h1>

        {!isConnected ? (
          <button
            onClick={connectWallet}
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition"
          >
            Connect Wallet
          </button>
        ) : (
          <div className="space-y-4">
            <div className="bg-gray-800 p-4 rounded">
              <h2 className="text-xl font-semibold mb-2">Wallet Details</h2>
              <p>Address: {userData.profile.stxAddress.testnet}</p>
              <p>Token Balance: {tokenBalance || "Loading..."}</p>
            </div>

            <button
              onClick={disconnectWallet}
              className="w-full bg-red-600 text-white py-2 rounded hover:bg-red-700 transition"
            >
              Disconnect Wallet
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default App1;
