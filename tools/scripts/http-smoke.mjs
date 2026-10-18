import http from "node:http";
import autocannon from "autocannon";
const server = http.createServer((_request, response) => {
  response.writeHead(200, { "content-type": "application/json" });
  response.end('{"ok":true}');
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
try {
  const result = await autocannon({
    url: `http://127.0.0.1:${server.address().port}`,
    connections: 2,
    amount: 20,
  });
  if (result.errors || result.non2xx || result.requests.total !== 20)
    throw new Error("HTTP load-tool smoke failed");
  console.log(
    "PASS: Autocannon completed 20 localhost requests, 0 errors. This is a tooling check, not ShopFast performance evidence.",
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
}
