import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/src/auth.module";
import { TicketsRuntime } from "./composition/tickets.runtime";
import {
  CustomerTicketsController,
  StaffTicketsController,
} from "./http/tickets.controllers";

@Module({
  imports: [AuthModule],
  controllers: [CustomerTicketsController, StaffTicketsController],
  providers: [TicketsRuntime],
  exports: [TicketsRuntime],
})
export class TicketsModule {}
