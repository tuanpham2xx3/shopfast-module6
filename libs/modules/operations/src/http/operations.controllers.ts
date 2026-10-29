import { Controller, Get, UseGuards } from "@nestjs/common";
import {
  probeDatabase,
  probeRedis,
} from "../../../../platform/src/health/dependency-probes";
import {
  AccessGuard,
  Roles,
  RolesGuard,
  VerifiedGuard,
} from "../../../auth/src/auth.guards";
import {
  JobsRuntime,
  queueSnapshot,
} from "../../../jobs/src/composition/jobs.runtime";
import { RuntimeServices } from "../../../runtime/src/composition/runtime.runtime";
import { TicketsRuntime } from "../../../tickets/src/composition/tickets.runtime";

@Controller("admin")
@UseGuards(AccessGuard, VerifiedGuard, RolesGuard)
@Roles("ADMIN")
export class OperationsController {
  constructor(
    private readonly jobs: JobsRuntime,
    private readonly tickets: TicketsRuntime,
    private readonly runtime: RuntimeServices,
  ) {}
  @Get("health") async health() {
    const [database, redis, queue, gemini, runtime, jobs] =
      await Promise.allSettled([
        probeDatabase(process.env.DATABASE_URL),
        probeRedis(process.env.REDIS_URL),
        queueSnapshot(),
        this.tickets.get().then((r) => r.ai.provider.health()),
        this.runtime.get(),
        this.jobs.get(),
      ]);
    return {
      checkedAt: new Date().toISOString(),
      database: database.status === "fulfilled" ? "ok" : "unavailable",
      redis: redis.status === "fulfilled" ? "ok" : "unavailable",
      queue:
        queue.status === "fulfilled"
          ? queue.value
          : { status: "unavailable", counts: null },
      gemini:
        gemini.status === "fulfilled"
          ? gemini.value
          : { status: "unavailable" },
      cache:
        runtime.status === "fulfilled"
          ? { metrics: runtime.value.cache.metrics }
          : { status: "unavailable" },
      email:
        jobs.status === "fulfilled"
          ? { mode: jobs.value.email.mode }
          : { status: "unavailable" },
    };
  }
}
