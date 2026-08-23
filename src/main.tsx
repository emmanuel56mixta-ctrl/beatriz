import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AudioLabBuilderV303 } from "@/components/lab/AudioLabBuilderV303";
import "@/builder.css";
import "@/builder-v303.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AudioLabBuilderV303 />
  </StrictMode>,
);
