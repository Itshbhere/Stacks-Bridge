// SOL to SIP Token Converter (ES Module version)
// This script allows users to enter an amount and get the conversion between SOL and SIP tokens

// Set the current exchange ratio (1 SOL = X SIP tokens)
const RATIO_SOL_TO_SIP = 10; // Example ratio, adjust as needed

/**
 * Converts SOL to SIP tokens
 * @param {number} solAmount - Amount of SOL to convert
 * @returns {number} Equivalent amount in SIP tokens
 */
function convertSolToSip(solAmount) {
  if (solAmount < 0) {
    throw new Error("Amount must be a positive number");
  }
  return solAmount * RATIO_SOL_TO_SIP;
}

/**
 * Converts SIP tokens to SOL
 * @param {number} sipAmount - Amount of SIP tokens to convert
 * @returns {number} Equivalent amount in SOL
 */
function convertSipToSol(sipAmount) {
  if (sipAmount < 0) {
    throw new Error("Amount must be a positive number");
  }
  return sipAmount / RATIO_SOL_TO_SIP;
}

// For ES Module environments - using readline for command line input
import * as readline from "readline";
import { stdin as input, stdout as output } from "process";

const rl = readline.createInterface({ input, output });

function getUserInput() {
  rl.question(
    "Enter conversion type (1 for SOL to SIP, 2 for SIP to SOL): ",
    (conversionType) => {
      if (conversionType !== "1" && conversionType !== "2") {
        console.log("Invalid choice. Please enter 1 or 2.");
        getUserInput();
        return;
      }

      const conversionName =
        conversionType === "1" ? "SOL to SIP" : "SIP to SOL";
      const inputCurrency = conversionType === "1" ? "SOL" : "SIP";

      rl.question(`Enter amount in ${inputCurrency}: `, (amount) => {
        const numericAmount = parseFloat(amount);

        if (isNaN(numericAmount) || numericAmount < 0) {
          console.log("Please enter a valid positive number.");
          getUserInput();
          return;
        }

        let result;
        if (conversionType === "1") {
          result = convertSolToSip(numericAmount);
          console.log(`${numericAmount} SOL = ${result} SIP tokens`);
        } else {
          result = convertSipToSol(numericAmount);
          console.log(`${numericAmount} SIP tokens = ${result.toFixed(8)} SOL`);
        }

        rl.question(
          "Do you want to perform another conversion? (y/n): ",
          (answer) => {
            if (answer.toLowerCase() === "y") {
              getUserInput();
            } else {
              console.log("Thank you for using the converter!");
              rl.close();
            }
          }
        );
      });
    }
  );
}

// Start the program
console.log("SOL to SIP Token Converter");
console.log(`Current exchange rate: 1 SOL = ${RATIO_SOL_TO_SIP} SIP tokens`);
getUserInput();

// For browser environments - this function can be used with HTML inputs
function convertInBrowser(amount, fromSOL) {
  if (isNaN(amount) || amount < 0) {
    return "Please enter a valid positive number.";
  }

  if (fromSOL) {
    return `${amount} SOL = ${convertSolToSip(amount)} SIP tokens`;
  } else {
    return `${amount} SIP tokens = ${convertSipToSol(amount).toFixed(8)} SOL`;
  }
}

// Export functions for use in other modules
export { convertSolToSip, convertSipToSol, RATIO_SOL_TO_SIP, convertInBrowser };
