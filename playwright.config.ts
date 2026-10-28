import { defineConfig } from "@playwright/test";
import { randomUUID } from "node:crypto";

process.env.E2E_SCHEMA ??= `test_e2e_${randomUUID().replace(/-/g, "")}`;
const database = process.env.TEST_DATABASE_URL;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  workers: 1,
  globalSetup: database ? "./tests/e2e/setup.ts" : undefined,
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command:
        "node node_modules/vite/bin/vite.js apps/web --host 127.0.0.1 --port 4173",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: !process.env.CI,
      env: { VITE_API_BASE: "http://127.0.0.1:4300/api/v1" },
    },
    ...(database
      ? [
          {
            command: "node dist/apps/api/src/main.js",
            url: "http://127.0.0.1:4300/api/v1/health/live",
            reuseExistingServer: false,
            env: {
              NODE_ENV: "test",
              HOST: "127.0.0.1",
              PORT: "4300",
              DATABASE_URL: database,
              DATABASE_SCHEMA: process.env.E2E_SCHEMA!,
              ACCESS_TOKEN_SECRET:
                "browser-e2e-only-secret-at-least-32-characters",
              WEB_ORIGIN: "http://127.0.0.1:4173",
              // Deterministic browser suite must never inherit real provider credentials.
              GEMINI_API_KEY: "",
              GEMINI_MODEL: "",
              RESEND_API_KEY: "",
              EMAIL_PROVIDER: "",
              EMAIL_PROVIDER_URL: "",
              EMAIL_PROVIDER_TOKEN: "",
              REDIS_URL: process.env.TEST_REDIS_URL ?? "",
            },
          },
        ]
      : []),
  ],
});
