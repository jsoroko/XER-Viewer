import { serve } from "bun";
import index from "./index.html";

// XER files are parsed entirely in the browser, so the server only ships the static app.
const server = serve({
  routes: {
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`XER Viewer running at ${server.url}`);
