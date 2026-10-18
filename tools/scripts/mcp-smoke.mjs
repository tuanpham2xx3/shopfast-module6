import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
const entry = fileURLToPath(
  new URL(
    "../node_modules/@upstash/context7-mcp/dist/index.js",
    import.meta.url,
  ),
);
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [entry],
  stderr: "pipe",
});
const client = new Client({ name: "shopfast-tooling-check", version: "0.1.0" });
try {
  await client.connect(transport, { timeout: 20000 });
  const result = await client.listTools({}, { timeout: 15000 });
  console.log(
    JSON.stringify({
      server: "context7",
      handshake: "PASS",
      tools: result.tools.map((t) => t.name),
    }),
  );
  if (!result.tools.some((t) => t.name === "resolve-library-id"))
    throw new Error("Missing documentation resolver");
  if (process.argv.includes("--query")) {
    const reply = await client.callTool(
      {
        name: "resolve-library-id",
        arguments: {
          libraryName: "nestjs",
          query: "NestJS 10 modules and dependency injection",
        },
      },
      undefined,
      { timeout: 30000 },
    );
    const content = reply.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n");
    const ok = !reply.isError && /Library ID|\/nestjs\//i.test(content);
    console.log(
      JSON.stringify({
        documentationQuery: ok ? "PASS" : "UNAVAILABLE",
        detail: content.slice(0, 450),
      }),
    );
    if (!ok) process.exitCode = 1;
  }
} finally {
  await client.close();
}
