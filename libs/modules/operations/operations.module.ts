import { Controller, Get, Module, UseGuards } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import {
  AccessGuard,
  Roles,
  RolesGuard,
  VerifiedGuard,
} from "../auth/auth.guards";
import { JobsModule, JobsRuntime, queueSnapshot } from "../jobs/jobs.module";
import { TicketsModule, TicketsRuntime } from "../tickets/tickets.module";
import { RuntimeModule, RuntimeServices } from "../runtime/runtime.module";
import {
  probeDatabase,
  probeRedis,
} from "../../platform/src/health/dependency-probes";

@Controller("admin")
@UseGuards(AccessGuard, VerifiedGuard, RolesGuard)
@Roles("ADMIN")
class OperationsController {
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
@Module({
  imports: [AuthModule, JobsModule, TicketsModule, RuntimeModule],
  controllers: [OperationsController],
})
export class OperationsModule {}
