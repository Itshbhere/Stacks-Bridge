// Import readline for terminal interaction
import readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Base rates
const baseSol = 1;
const baseSip = 169;

// Function to calculate SOL to SIP010 swap
function solToSip(solAmount) {
  const sipAmount = (solAmount * baseSip) / baseSol;
  return {
    solInput: solAmount,
    sipOutput: sipAmount.toFixed(4),
  };
}

// Function to calculate SIP010 to SOL swap
function sipToSol(sipAmount) {
  const solAmount = (sipAmount * baseSol) / baseSip;
  return {
    sipInput: sipAmount,
    solOutput: solAmount.toFixed(4),
  };
}

// Function to handle user interaction
function startSwapCalculator() {
  console.log("\n=== Token Swap Calculator ===");
  console.log("1. SOL to SIP010");
  console.log("2. SIP010 to SOL");

  rl.question("\nSelect swap direction (1 or 2): ", (choice) => {
    if (choice === "1") {
      rl.question("Enter SOL amount: ", (amount) => {
        const result = solToSip(parseFloat(amount));
        console.log("\nSwap Result:");
        console.log(`Input: ${result.solInput} SOL`);
        console.log(`Output: ${result.sipOutput} SIP010`);
        askToContinue();
      });
    } else if (choice === "2") {
      rl.question("Enter SIP010 amount: ", (amount) => {
        const result = sipToSol(parseFloat(amount));
        console.log("\nSwap Result:");
        console.log(`Input: ${result.sipInput} SIP010`);
        console.log(`Output: ${result.solOutput} SOL`);
        askToContinue();
      });
    } else {
      console.log("Invalid choice. Please select 1 or 2.");
      startSwapCalculator();
    }
  });
}

// Function to ask if user wants to continue
function askToContinue() {
  rl.question(
    "\nWould you like to calculate another swap? (y/n): ",
    (answer) => {
      if (answer.toLowerCase() === "y") {
        startSwapCalculator();
      } else {
        console.log("Thank you for using Token Swap Calculator!");
        rl.close();
      }
    }
  );
}

// Error handling for invalid inputs
function handleInvalidInput(amount) {
  if (isNaN(amount) || amount <= 0) {
    console.log("Please enter a valid positive number.");
    return true;
  }
  return false;
}

// Start the calculator
console.log("Welcome to Token Swap Calculator");
startSwapCalculator();
