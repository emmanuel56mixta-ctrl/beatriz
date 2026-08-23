import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AudioLabBuilder } from "@/components/lab/AudioLabBuilder";
import "@/builder.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AudioLabBuilder />
  </StrictMode>,
);
