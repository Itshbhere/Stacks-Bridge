import React, { useState, useCallback } from "react";
import { UserSession, showConnect } from "@stacks/connect";

const TokenSwapInterface = ({
  userSession,
  userData,
  isConnected,
  connectWallet,
}) => {
  const [inputAmount, setInputAmount] = useState("");
  const [outputAmount, setOutputAmount] = useState("");
  const [isReversed, setIsReversed] = useState(false);

  // Base rates
  const SOL_TO_SIP = 169;

  const calculateSwap = useCallback((amount, isSolToSip) => {
    if (!amount) return "";
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount)) return "";

    return isSolToSip
      ? (numAmount * SOL_TO_SIP).toFixed(4)
      : (numAmount / SOL_TO_SIP).toFixed(4);
  }, []);

  const handleInputChange = (value) => {
    setInputAmount(value);
    setOutputAmount(calculateSwap(value, !isReversed));
  };

  const handleSwitch = () => {
    setIsReversed(!isReversed);
    setInputAmount("");
    setOutputAmount("");
  };

  const handleSwap = async () => {
    if (!isConnected) {
      connectWallet();
      return;
    }
    // Add swap logic here
    alert("Swap functionality will be implemented here");
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-gray-800 p-6 rounded-lg shadow-lg">
        {/* Swap Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Swap</h2>
          <button className="text-gray-400 hover:text-white">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>

        {/* Input Token */}
        <div className="bg-gray-700 p-4 rounded-lg mb-2">
          <div className="flex justify-between mb-2">
            <span className="text-gray-400">You pay</span>
            <span className="text-gray-400">
              Balance: {isConnected ? "0.00" : "---"}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="number"
              placeholder="0.0"
              value={inputAmount}
              onChange={(e) => handleInputChange(e.target.value)}
              className="w-full text-2xl bg-transparent border-none focus:outline-none"
            />
            <button className="bg-gray-600 px-4 py-2 rounded-lg hover:bg-gray-500">
              {isReversed ? "SIP010" : "SOL"}
            </button>
          </div>
        </div>

        {/* Swap Button */}
        <div className="relative flex justify-center my-4">
          <button
            className="absolute top-1/2 -translate-y-1/2 bg-gray-700 p-2 rounded-full hover:bg-gray-600"
            onClick={handleSwitch}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v14M5 12l7 7 7-7" />
            </svg>
          </button>
        </div>

        {/* Output Token */}
        <div className="bg-gray-700 p-4 rounded-lg mb-4">
          <div className="flex justify-between mb-2">
            <span className="text-gray-400">You receive</span>
            <span className="text-gray-400">
              Balance: {isConnected ? "0.00" : "---"}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="number"
              placeholder="0.0"
              value={outputAmount}
              readOnly
              className="w-full text-2xl bg-transparent border-none focus:outline-none"
            />
            <button className="bg-gray-600 px-4 py-2 rounded-lg hover:bg-gray-500">
              {isReversed ? "SOL" : "SIP010"}
            </button>
          </div>
        </div>

        {/* Rate Info */}
        <div className="bg-gray-700 p-4 rounded-lg mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Rate</span>
            <span>
              1 {isReversed ? "SIP010" : "SOL"} ={" "}
              {isReversed ? (1 / SOL_TO_SIP).toFixed(4) : SOL_TO_SIP}{" "}
              {isReversed ? "SOL" : "SIP010"}
            </span>
          </div>
        </div>

        {/* Swap Button */}
        <button
          className="w-full bg-blue-600 text-white py-3 rounded-lg text-lg font-semibold hover:bg-blue-700 transition"
          onClick={handleSwap}
          disabled={!inputAmount || inputAmount === "0"}
        >
          {!isConnected
            ? "Connect Wallet"
            : !inputAmount
            ? "Enter an amount"
            : "Swap"}
        </button>
      </div>
    </div>
  );
};

export default TokenSwapInterface;
