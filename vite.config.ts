import { defineConfig, type Plugin } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

/**
 * Serves the handlers in api/ (grade, collect, stats) during `npm run dev`.
 *
 * In production the function is deployed by the host. Vite's dev server does
 * not know about it, so without this the grading call 404s locally and the one
 * feature worth testing cannot be tested. The handler is written against the
 * Web Request/Response API, so this only has to translate Node's streams at
 * the edges.
 *
 * Imported through Vite's module runner rather than a plain import so edits to
 * the handler take effect without restarting the server.
 */
const API_ROUTES = ["grade", "collect", "stats"];

function apiRoutes(): Plugin {
  return {
    name: "sixty-api-dev",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api", (req, res, next) => {
        // Mounted at /api, so req.url is the rest of the path: "/grade", "/stats?x=1".
        const name = /^\/([a-z]+)(?:[?/]|$)/.exec(req.url ?? "")?.[1];
        if (!name || !API_ROUTES.includes(name)) {
          next();
          return;
        }
        void (async () => {
          try {
            const chunks: Buffer[] = [];
            for await (const chunk of req) chunks.push(chunk as Buffer);

            const mod = (await server.ssrLoadModule(`/api/${name}.ts`)) as {
              default: (request: Request) => Promise<Response>;
            };

            const request = new Request(`http://localhost/api${req.url ?? "/"}`, {
              method: req.method ?? "GET",
              headers: req.headers as HeadersInit,
              ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
            });

            const response = await mod.default(request);
            res.statusCode = response.status;
            response.headers.forEach((value, key) => res.setHeader(key, value));
            res.end(Buffer.from(await response.arrayBuffer()));
          } catch (error) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                error: "dev-handler-failed",
                detail: error instanceof Error ? error.message : String(error),
              }),
            );
          }
        })();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // The grading handler reads process.env, and unprefixed keys are not loaded
  // into it by default. Only the dev server sees these; nothing here is
  // inlined into the client bundle, so the credential stays server-side.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));

  return {
    plugins: [react(), tailwindcss(), apiRoutes()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.test.{ts,tsx}"],
    },
  };
});
