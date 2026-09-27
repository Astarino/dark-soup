import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, extname, sep } from "node:path";
import { spawn } from "node:child_process";
const root = fileURLToPath(new URL("../", import.meta.url));
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || "127.0.0.1";
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    const file = resolve(
      root,
      "." +
        decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname),
    );
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) {
      response.writeHead(403).end();
      return;
    }
    if (!(await stat(file)).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      "Content-Type": mime[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404).end("Not found");
  }
});
server.on("error", (error) => {
  console.error(
    error.code === "EADDRINUSE"
      ? `Port ${port} is occupied. Close the old server or set PORT to another value (saved preferences are per origin).`
      : error.message,
  );
  process.exitCode = 1;
});
server.listen(port, host, () => {
  const url = `http://localhost:${port}`;
  console.log(`Dark Soup: ${url}\nStop: Ctrl+C`);
  if (process.argv.includes("--open")) {
    const command =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "explorer"
          : "xdg-open";
    spawn(command, [url], { stdio: "ignore" }).on("error", () =>
      console.log(`Open ${url} in your browser.`),
    );
  }
});
