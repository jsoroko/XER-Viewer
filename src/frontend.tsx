import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

const elem = document.getElementById("root")!;
const app = (
  <StrictMode>
    <App />
  </StrictMode>
);

// Reuse the root across hot reloads so state survives edits in dev.
(import.meta.hot.data.root ??= createRoot(elem)).render(app);
