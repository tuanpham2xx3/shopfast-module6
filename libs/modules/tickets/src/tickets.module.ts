import {
  Body,
  Controller,
  Get,
  HttpCode,
  Injectable,
  Module,
  OnApplicationShutdown,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Type } from "class-transformer";
import {
  Equals,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from "class-validator";
import { DataSource } from "typeorm";
import { createDataSource } from "../../../platform/src/database/data-source";
import {
  AccessGuard,
  AuthenticatedRequest,
  Roles,
  RolesGuard,
  VerifiedGuard,
} from "../../auth/src/auth.guards";
import { AuthModule } from "../../auth/src/auth.module";
import { categories, TicketsService } from "./tickets.service";
import { AiService } from "../../ai/src/ai.service";
class PageDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
class FilterDto extends PageDto {
  @IsOptional()
  @IsIn(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"])
  status?: string;
  @IsOptional() @IsIn(categories) category?: string;
  @IsOptional() @IsUUID() assignedTo?: string;
}
class CreateDto {
  @IsString() @Length(5, 150) subject!: string;
  @IsString() @Length(1, 4000) body!: string;
  @IsOptional() @IsUUID() orderId?: string;
}
class MessageDto {
  @IsString() @Length(1, 4000) body!: string;
  @IsOptional() @IsUUID() approvedAiMessageId?: string;
}
class VersionDto {
  @IsInt() @Min(1) expectedVersion!: number;
}
class ClaimDto extends VersionDto {
  @IsOptional() @IsUUID() agentId?: string;
}
class UpdateDto extends VersionDto {
  @IsOptional()
  @IsIn(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"])
  status?: string;
  @IsOptional() @IsIn(categories) category?: string;
}
class AiMessageDto {
  @IsString() @Length(1, 4000) message!: string;
  @IsUUID() clientMessageId!: string;
}
class ConfirmDto extends VersionDto {
  @Equals(true) confirm!: boolean;
}
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
@Controller("tickets")
@UseGuards(AccessGuard, VerifiedGuard, RolesGuard)
@Roles("CUSTOMER")
class CustomerTicketsController {
  constructor(private readonly runtime: TicketsRuntime) {}
  @Post() async create(@Req() r: AuthenticatedRequest, @Body() d: CreateDto) {
    return (await this.runtime.get()).tickets.create(r.user!, d);
  }
  @Get() async list(@Req() r: AuthenticatedRequest, @Query() q: PageDto) {
    return (await this.runtime.get()).tickets.list(r.user!, q);
  }
  @Get(":id") async detail(
    @Req() r: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() q: PageDto,
  ) {
    return (await this.runtime.get()).tickets.detail(r.user!, id, q);
  }
  @Post(":id/messages") async message(
    @Req() r: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() d: MessageDto,
  ) {
    return (await this.runtime.get()).tickets.message(
      r.user!,
      id,
      d.body,
      d.approvedAiMessageId,
    );
  }
  @Post(":id/reopen") @HttpCode(200) async reopen(
    @Req() r: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() d: VersionDto,
  ) {
    return (await this.runtime.get()).tickets.update(r.user!, id, d, true);
  }
}
@Controller("staff")
@UseGuards(AccessGuard, VerifiedGuard, RolesGuard)
@Roles("SUPPORT", "ADMIN")
class StaffTicketsController {
  constructor(private readonly runtime: TicketsRuntime) {}
  @Get("tickets") async list(
    @Req() r: AuthenticatedRequest,
    @Query() q: FilterDto,
  ) {
    return (await this.runtime.get()).tickets.list(r.user!, q);
  }
  @Get("tickets/:id") async detail(
    @Req() r: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() q: PageDto,
  ) {
    return (await this.runtime.get()).tickets.detail(r.user!, id, q);
  }
  @Get("tickets/:id/order") async order(
    @Req() r: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return (await this.runtime.get()).tickets.order(r.user!, id);
  }
  @Get("tickets/:id/orders/:orderCode") async lookup(
    @Req() r: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("orderCode") code: string,
  ) {
    return (await this.runtime.get()).tickets.order(r.user!, id, code);
  }
  @Post("tickets/:id/claim") @HttpCode(200) async claim(
    @Req() r: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() d: ClaimDto,
  ) {
    return (await this.runtime.get()).tickets.claim(
      r.user!,
      id,
      d.expectedVersion,
      d.agentId,
    );
  }
  @Patch("tickets/:id") async update(
    @Req() r: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() d: UpdateDto,
  ) {
    return (await this.runtime.get()).tickets.update(r.user!, id, d);
  }
  @Post("tickets/:id/messages") async message(
    @Req() r: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() d: MessageDto,
  ) {
    return (await this.runtime.get()).tickets.message(
      r.user!,
      id,
      d.body,
      d.approvedAiMessageId,
    );
  }
  @Post("tickets/:id/ai-sessions") async session(
    @Req() r: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return (await this.runtime.get()).ai.createSession(r.user!, id);
  }
  @Post("ai-sessions/:id/messages") @HttpCode(200) async aiMessage(
    @Req() r: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() d: AiMessageDto,
  ) {
    return (await this.runtime.get()).ai.message(
      r.user!,
      id,
      d.message,
      d.clientMessageId,
    );
  }
  @Post("ai-proposals/:id/confirm") @HttpCode(200) async confirm(
    @Req() r: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() d: ConfirmDto,
  ) {
    return (await this.runtime.get()).ai.decide(
      r.user!,
      id,
      true,
      d.expectedVersion,
    );
  }
  @Post("ai-proposals/:id/reject") @HttpCode(200) async reject(
    @Req() r: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return (await this.runtime.get()).ai.decide(r.user!, id, false);
  }
}
@Module({
  imports: [AuthModule],
  controllers: [CustomerTicketsController, StaffTicketsController],
  providers: [TicketsRuntime],
  exports: [TicketsRuntime],
})
export class TicketsModule {}
