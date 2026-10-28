import {
  Injectable,
  OnApplicationShutdown,
  ServiceUnavailableException,
} from "@nestjs/common";
import { DataSource } from "typeorm";
import { createDataSource } from "../../../platform/src/database/data-source";
import { AuthService } from "./auth.service";

@Injectable()
export class AuthRuntime implements OnApplicationShutdown {
  private source?: DataSource;
  private service?: AuthService;

  async get(): Promise<AuthService> {
    if (this.service) return this.service;
    if (!process.env.DATABASE_URL || !process.env.ACCESS_TOKEN_SECRET)
      throw new ServiceUnavailableException();
    this.source = await createDataSource(
      process.env.DATABASE_URL,
      process.env.DATABASE_SCHEMA ?? "public",
    ).initialize();
    this.service = new AuthService(this.source, {
      accessTokenSecret: process.env.ACCESS_TOKEN_SECRET,
      schema: process.env.DATABASE_SCHEMA,
    });
    return this.service;
  }

  async onApplicationShutdown() {
    if (this.source?.isInitialized) await this.source.destroy();
  }
}
