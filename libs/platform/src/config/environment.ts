import { z } from "zod";

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  HOST: z.string().ip().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  API_PREFIX: z.literal("api/v1").default("api/v1"),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  DATABASE_URL: z
    .string()
    .url()
    .refine(
      (value) => /^postgres(?:ql)?:/.test(value),
      "Expected PostgreSQL URL",
    )
    .optional(),
  REDIS_URL: z
    .string()
    .url()
    .refine((value) => /^rediss?:/.test(value), "Expected Redis URL")
    .optional(),
});

export type AppEnvironment = z.infer<typeof schema>;

export function parseEnvironment(input: NodeJS.ProcessEnv): AppEnvironment {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new Error(
      `Invalid environment: ${result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`,
    );
  }
  return result.data;
}
