import "dotenv/config";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const secrets = [
  "GEMINI_API_KEY",
  "RESEND_API_KEY",
  "EMAIL_PROVIDER_TOKEN",
  "ACCESS_TOKEN_SECRET",
  "INVOICE_SIGNING_SECRET",
]
  .map((k) => process.env[k])
  .filter((v) => v && v.length >= 16);
const violations = [];
for (const file of files) {
  if (
    file.startsWith(".secrets/") ||
    /\.(pem|ppk)$/.test(file) ||
    /^\.env($|\.(?!example))/.test(file)
  ) {
    violations.push({ file, reason: "secret path tracked" });
    continue;
  }
  try {
    const content = await readFile(file);
    if (secrets.some((v) => content.includes(Buffer.from(v))))
      violations.push({ file, reason: "configured secret value found" });
  } catch {}
}
console.log(
  JSON.stringify({
    trackedFilesChecked: files.length,
    status: violations.length ? "FAIL" : "PASS",
    violations,
  }),
);
if (violations.length) process.exitCode = 1;
