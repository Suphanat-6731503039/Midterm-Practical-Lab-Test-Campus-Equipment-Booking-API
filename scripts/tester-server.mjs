import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const port = Number(process.env.TESTER_PORT ?? 5500);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("TESTER_PORT must be an integer between 1 and 65535");
}

const pages = new Map([
  ["/", await readFile(new URL("../public/tester.html", import.meta.url))],
  ["/tester.html", await readFile(new URL("../public/tester.html", import.meta.url))],
]);
const server = createServer((request, response) => {
  const path = new URL(request.url ?? "/", "http://localhost").pathname;
  const page = pages.get(path);
  if (request.method !== "GET" || !page) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(page);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Booking API tester available at http://localhost:${port}`);
});