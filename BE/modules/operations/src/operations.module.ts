import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/src/auth.module";
import { JobsModule } from "../../jobs/src/jobs.module";
import { RuntimeModule } from "../../runtime/src/runtime.module";
import { TicketsModule } from "../../tickets/src/tickets.module";
import { OperationsController } from "./http/operations.controllers";

@Module({
  imports: [AuthModule, JobsModule, TicketsModule, RuntimeModule],
  controllers: [OperationsController],
})
export class OperationsModule {}
