import { Injectable, OnApplicationShutdown } from "@nestjs/common";
import { DataSource } from "typeorm";
import { createDataSource } from "../../../../platform/src/database/data-source";
import { AiService } from "../../../ai/src/ai.service";
import { TicketsService } from "../tickets.service";

@Injectable()
export class TicketsRuntime implements OnApplicationShutdown {
  private pending?: Promise<{ tickets: TicketsService; ai: AiService }>;
  private source?: DataSource;
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
    const tickets = new TicketsService(
      this.source,
      process.env.DATABASE_SCHEMA,
    );
    return { tickets, ai: new AiService(tickets) };
  }
  async onApplicationShutdown() {
    if (this.source?.isInitialized) await this.source.destroy();
  }
}
