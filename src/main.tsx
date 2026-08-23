import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AudioLabBuilderV306 } from "@/components/lab/AudioLabBuilderV306";
import "@/console-v305.css";
import "@/console-v306.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AudioLabBuilderV306 />
  </StrictMode>,
);
