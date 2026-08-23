import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BeatrisApp } from "@/components/beatris/BeatrisApp";
import "@/styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BeatrisApp />
  </StrictMode>,
);
