import { Module } from "@nestjs/common";
import { RuntimeModule } from "../../runtime/src/runtime.module";
import { AccessGuard, RolesGuard, VerifiedGuard } from "./http/auth.guards";
import { AuthRuntime } from "./composition/auth.runtime";
import { AuthController } from "./http/auth.controllers";

@Module({
  imports: [RuntimeModule],
  controllers: [AuthController],
  providers: [AuthRuntime, AccessGuard, VerifiedGuard, RolesGuard],
  exports: [AuthRuntime, AccessGuard, VerifiedGuard, RolesGuard],
})
export class AuthModule {}
