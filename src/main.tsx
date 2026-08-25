import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CandyCoreGame } from "@/candy/CandyCoreGame";
import "@/candy/candy-core.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CandyCoreGame />
  </StrictMode>,
);
