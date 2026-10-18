import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { parseEnvironment } from "../../../libs/platform/src/config/environment";
import { FoundationWorker } from "../../../libs/platform/src/queue/foundation-worker";

@Module({
  providers: [FoundationWorker],
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: parseEnvironment }),
  ],
})
class WorkerModule {}

async function main() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
}
void main();
