import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AudioLab } from "@/components/lab/AudioLab";
import "@/lab.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AudioLab />
  </StrictMode>,
);
