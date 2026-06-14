import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AddressInfo } from "node:net";

export interface DemoServer {
  url: string;
  close: () => Promise<void>;
}

/**
 * Serves our neutral demo page over http on a random local port. Content
 * scripts inject themselves onto real http(s) pages, so we need a genuine URL
 * (not a file:// path) for the overlay to appear.
 */
export async function startDemoServer(): Promise<DemoServer> {
  const htmlPath = path.resolve(__dirname, "..", "assets", "demo-page.html");
  const html = await readFile(htmlPath, "utf8");

  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}/`,
    // The browser holds an idle keep-alive socket open, which makes a plain
    // server.close() block until the browser exits (~3 minutes). Force those
    // sockets closed so this returns at once; a timeout guards against any edge.
    close: () =>
      new Promise<void>((resolve) => {
        const safety = setTimeout(resolve, 1000);
        server.closeAllConnections();
        server.close(() => {
          clearTimeout(safety);
          resolve();
        });
      }),
  };
}
