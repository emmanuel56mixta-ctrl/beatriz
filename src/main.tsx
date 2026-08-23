import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AudioLabBuilderV310 } from "@/components/lab/AudioLabBuilderV310";
import "@/console-v307.css";
import "@/console-v308.css";
import "@/console-v309.css";
import "@/console-v310.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AudioLabBuilderV310 />
  </StrictMode>,
);
