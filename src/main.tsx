import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AudioLabQuarry } from "@/components/lab/AudioLabQuarry";
import "@/lab.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AudioLabQuarry />
  </StrictMode>,
);
