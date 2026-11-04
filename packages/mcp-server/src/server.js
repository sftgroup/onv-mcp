import http from "http";

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "ok", service: "onv-mcp" }));
});

server.listen(3503, "0.0.0.0", () => {
  console.log("MCP listening on 3503");
});
