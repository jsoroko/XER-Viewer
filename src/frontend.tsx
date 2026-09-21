import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { applyStoredTheme } from "./lib/themes";
import "./index.css";

// Before anything is drawn, so a returning visitor never sees the wrong colours flash by.
applyStoredTheme();

const elem = document.getElementById("root")!;
const app = (
  <StrictMode>
    <App />
  </StrictMode>
);

// Reuse the root across hot reloads so state survives edits in dev.
(import.meta.hot.data.root ??= createRoot(elem)).render(app);
