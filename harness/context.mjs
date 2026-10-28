import "dotenv/config";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
export function harnessContext() {
  const commit = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const dirty = !!execFileSync("git", ["status", "--porcelain"], {
    encoding: "utf8",
  }).trim();
  const configHash = createHash("sha256")
    .update(
      JSON.stringify({
        target: "https://shopfast.tuanpq.com",
        model: process.env.GEMINI_MODEL,
        live: process.env.HARNESS_LIVE_PROVIDERS === "true",
        reboot: process.env.HARNESS_REBOOT_HOST === "true",
        databaseConfigured: !!process.env.TEST_DATABASE_URL,
        redisConfigured: !!process.env.TEST_REDIS_URL,
        candidate: process.env.HARNESS_CANDIDATE_SHA ?? null,
        credentials: createHash("sha256")
          .update(
            [
              process.env.GEMINI_API_KEY,
              process.env.RESEND_API_KEY,
              process.env.TEST_DATABASE_URL,
              process.env.TEST_REDIS_URL,
            ].join("|"),
          )
          .digest("hex"),
      }),
    )
    .digest("hex");
  return { commit, dirty, configHash };
}
