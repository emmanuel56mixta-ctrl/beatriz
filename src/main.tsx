import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AudioLabBuilderV305 } from "@/components/lab/AudioLabBuilderV305";
import "@/console-v305.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AudioLabBuilderV305 />
  </StrictMode>,
);
