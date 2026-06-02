import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApiHandler } from "./server/api.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const handleApi = createApiHandler(root);

export default defineConfig({
  root: path.dirname(fileURLToPath(import.meta.url)),
  server: {
    port: 5173,
    fs: { allow: [root] },
  },
  plugins: [
    {
      name: "bench-api",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = req.url?.split("?")[0] ?? "";
          if (!url.startsWith("/api/")) {
            next();
            return;
          }
          try {
            const handled = await handleApi(req, res, url);
            if (!handled) next();
          } catch (err) {
            res.statusCode = 500;
            res.end(String(err));
          }
        });
      },
    },
  ],
});
