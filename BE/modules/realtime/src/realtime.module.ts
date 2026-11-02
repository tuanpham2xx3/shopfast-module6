import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/src/auth.module";
import { OrderRealtime } from "./adapters/realtime.gateway";

@Module({ imports: [AuthModule], providers: [OrderRealtime] })
export class RealtimeModule {}
