import { Injectable, OnApplicationShutdown } from "@nestjs/common";
import { DataSource } from "typeorm";
import { createDataSource } from "../../../../platform/src/database/data-source";
import { RuntimeServices } from "../../../runtime/src/composition/runtime.runtime";
import { CatalogService } from "../catalog.service";

@Injectable()
export class CatalogRuntime implements OnApplicationShutdown {
  constructor(private readonly protections: RuntimeServices) {}
  private pending?: Promise<CatalogService>;
  private source?: DataSource;
  get(): Promise<CatalogService> {
    if (!this.pending)
      this.pending = this.initialize().catch((error) => {
        this.pending = undefined;
        throw error;
      });
    return this.pending;
  }
  private async initialize() {
    this.source = await createDataSource(
      process.env.DATABASE_URL!,
      process.env.DATABASE_SCHEMA ?? "public",
    ).initialize();
    const { cache } = await this.protections.get();
    return new CatalogService(this.source, process.env.DATABASE_SCHEMA, cache);
  }
  async onApplicationShutdown() {
    if (this.source?.isInitialized) await this.source.destroy();
  }
}
