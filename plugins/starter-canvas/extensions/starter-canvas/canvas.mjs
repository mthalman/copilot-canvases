import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { once } from "node:events";

const servers = new Map();

async function startServer() {
  const html = await readFile(new URL("./index.html", import.meta.url));
  const server = createServer((request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'",
    );

    if (request.url !== "/") {
      response.writeHead(404);
      response.end();
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end();
      return;
    }

    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(request.method === "HEAD" ? undefined : html);
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  return { server, url: `http://127.0.0.1:${server.address().port}/` };
}

export const canvasOptions = {
  id: "starter-canvas",
  displayName: "Starter canvas",
  description: "A minimal working canvas with an example echo action.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  actions: [
    {
      name: "echo",
      description: "Return a message to confirm the canvas action is connected.",
      inputSchema: {
        type: "object",
        properties: {
          message: { type: "string", maxLength: 1000 },
        },
        required: ["message"],
        additionalProperties: false,
      },
      handler: ({ input }) => ({ message: input.message }),
    },
  ],
  open: async ({ instanceId }) => {
    let pending = servers.get(instanceId);
    if (!pending) {
      pending = startServer();
      servers.set(instanceId, pending);
    }

    let entry;
    try {
      entry = await pending;
    } catch (error) {
      if (servers.get(instanceId) === pending) {
        servers.delete(instanceId);
      }
      throw error;
    }

    return { title: "Starter canvas", url: entry.url };
  },
  onClose: async ({ instanceId }) => {
    const pending = servers.get(instanceId);
    if (!pending) {
      return;
    }
    servers.delete(instanceId);
    const { server } = await pending;
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  },
};
