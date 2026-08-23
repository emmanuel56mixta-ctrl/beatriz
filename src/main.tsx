import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AudioLabBuilderV307 } from "@/components/lab/AudioLabBuilderV307";
import "@/console-v305.css";
import "@/console-v306.css";
import "@/console-v307.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AudioLabBuilderV307 />
  </StrictMode>,
);
