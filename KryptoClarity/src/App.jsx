import { useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import App1 from "./Components/Mainpage";
import WalletCreator from "./Components/SecondPage";
import TokenTransfer from "./Components/TokenTransfer";
import TokenSwapInterface from "./Components/DEX";

function App() {
  const [count, setCount] = useState(0);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App1 />} />
        <Route path="/wallet" element={<WalletCreator />} />
        <Route path="/tt" element={<TokenTransfer />} />
        <Route path="/dex" element={<TokenSwapInterface />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
