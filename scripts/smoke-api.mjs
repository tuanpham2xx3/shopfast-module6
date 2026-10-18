import { spawn } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import net from "node:net";

const port = await new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const value = server.address().port;
    server.close(() => resolve(value));
  });
});
const child = spawn(process.execPath, ["dist/apps/api/src/main.js"], {
  env: {
    ...process.env,
    NODE_ENV: "test",
    PORT: String(port),
    HOST: "127.0.0.1",
  },
  stdio: "ignore",
  windowsHide: true,
});
let exited = false;
child.once("exit", () => {
  exited = true;
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    if (exited) throw new Error("Compiled API exited before becoming live");
    try {
      const response = await fetch(
        `http://127.0.0.1:${port}/api/v1/health/live`,
      );
      const body = await response.json();
      if (response.ok && body.data.status === "ok" && body.requestId) {
        ready = true;
        break;
      }
    } catch {
      /* Wait for the listener. */
    }
    await setTimeout(100);
  }
  if (!ready) throw new Error("Compiled API did not become live");
  console.log("PASS: compiled API starts and serves its liveness contract");
} finally {
  child.kill();
}
