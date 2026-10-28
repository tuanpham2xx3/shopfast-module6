import { z } from "zod";

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  HOST: z.string().ip().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  API_PREFIX: z.literal("api/v1").default("api/v1"),
  WEB_ORIGIN: z.string().url().default("http://127.0.0.1:5173"),
  DATABASE_URL: z
    .string()
    .url()
    .refine(
      (value) => /^postgres(?:ql)?:/.test(value),
      "Expected PostgreSQL URL",
    )
    .optional(),
  DATABASE_SCHEMA: z
    .string()
    .regex(/^[a-z][a-z0-9_]{0,62}$/)
    .default("public"),
  ACCESS_TOKEN_SECRET: z.string().min(32).optional(),
  REDIS_URL: z
    .string()
    .url()
    .refine((value) => /^rediss?:/.test(value), "Expected Redis URL")
    .optional(),
});

export type AppEnvironment = z.infer<typeof schema>;

export function parseEnvironment(input: NodeJS.ProcessEnv): AppEnvironment {
  if (input.NODE_ENV === "production") {
    const missing = [
      "DATABASE_URL",
      "REDIS_URL",
      "ACCESS_TOKEN_SECRET",
      "INVOICE_SIGNING_SECRET",
      "GEMINI_API_KEY",
      "GEMINI_MODEL",
    ].filter((name) => !input[name]);
    if (missing.length)
      throw new Error(
        `Missing production configuration: ${missing.join(", ")}`,
      );
    if (!input.WEB_ORIGIN?.startsWith("https://"))
      throw new Error("Production WEB_ORIGIN requires HTTPS");
    if (
      input.EMAIL_PROVIDER === "resend" &&
      (!input.RESEND_API_KEY || !input.EMAIL_FROM)
    )
      throw new Error("Production Resend configuration missing");
    if (
      input.EMAIL_PROVIDER !== "resend" &&
      (!input.EMAIL_PROVIDER_URL || !input.EMAIL_PROVIDER_TOKEN)
    )
      throw new Error("Production email provider required");
    if (input.INVOICE_SIGNING_SECRET!.length < 32)
      throw new Error("INVOICE_SIGNING_SECRET too short");
  }
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new Error(
      `Invalid environment: ${result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`,
    );
  }
  return result.data;
}
