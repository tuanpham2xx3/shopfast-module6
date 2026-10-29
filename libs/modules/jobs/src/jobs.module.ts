import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/src/auth.module";
import { JobsRuntime } from "./composition/jobs.runtime";
import {
  InvoiceController,
  JobsAdminController,
} from "./http/jobs.controllers";

@Module({
  imports: [AuthModule],
  controllers: [InvoiceController, JobsAdminController],
  providers: [JobsRuntime],
  exports: [JobsRuntime],
})
export class JobsModule {}
