import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AudioLabBuilderV304 } from "@/components/lab/AudioLabBuilderV304";
import "@/builder.css";
import "@/builder-v303.css";
import "@/builder-v304.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AudioLabBuilderV304 />
  </StrictMode>,
);
