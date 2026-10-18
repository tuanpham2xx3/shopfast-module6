import "reflect-metadata";
import { Module, Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { parseEnvironment } from "../../../libs/platform/src/config/environment";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: parseEnvironment }),
  ],
})
class WorkerModule {}

async function main() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  Logger.log(
    "Worker foundation initialized; queue handlers pending M0 queue task",
    "Worker",
  );
}
void main();
