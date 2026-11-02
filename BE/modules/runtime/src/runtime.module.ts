import { Global, Module } from "@nestjs/common";
import { RuntimeServices } from "./composition/runtime.runtime";
import { RuntimeRateInterceptor } from "./http/runtime.interceptor";

@Global()
@Module({
  providers: [RuntimeServices, RuntimeRateInterceptor],
  exports: [RuntimeServices, RuntimeRateInterceptor],
})
export class RuntimeModule {}
