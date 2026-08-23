import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AudioLabBuilderV308 } from "@/components/lab/AudioLabBuilderV308";
import "@/console-v307.css";
import "@/console-v308.css";
import "@/console-v309.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AudioLabBuilderV308 />
  </StrictMode>,
);
