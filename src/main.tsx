import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Beatris } from "@/components/game/Beatris";
import "@/styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Beatris />
  </StrictMode>,
);
