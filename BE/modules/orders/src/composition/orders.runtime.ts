import { Injectable, OnApplicationShutdown } from "@nestjs/common";
import { DataSource } from "typeorm";
import { createDataSource } from "../../../../platform/src/database/data-source";
import { RuntimeServices } from "../../../runtime/src/composition/runtime.runtime";
import { OrderService } from "../application/order.service";

@Injectable()
export class OrderRuntime implements OnApplicationShutdown {
  constructor(private readonly protections: RuntimeServices) {}
  private source?: DataSource;
  private pending?: Promise<OrderService>;
  get() {
    if (!this.pending)
      this.pending = this.initialize().catch((e) => {
        this.pending = undefined;
        throw e;
      });
    return this.pending;
  }
  private async initialize() {
    this.source = await createDataSource(
      process.env.DATABASE_URL!,
      process.env.DATABASE_SCHEMA ?? "public",
    ).initialize();
    const { cache } = await this.protections.get();
    return new OrderService(this.source, process.env.DATABASE_SCHEMA, cache);
  }
  async onApplicationShutdown() {
    if (this.source?.isInitialized) await this.source.destroy();
  }
}
