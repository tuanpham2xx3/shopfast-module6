import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  AccessGuard,
  AuthenticatedRequest,
  Roles,
  RolesGuard,
  VerifiedGuard,
} from "../../../auth/src/http/auth.guards";
import { TicketsRuntime } from "../composition/tickets.runtime";
import {
  AiMessageDto,
  ClaimDto,
  ConfirmDto,
  CreateDto,
  FilterDto,
  MessageDto,
  PageDto,
  UpdateDto,
  VersionDto,
} from "./tickets.dto";

@Controller("tickets")
@UseGuards(AccessGuard, VerifiedGuard, RolesGuard)
@Roles("CUSTOMER")
export class CustomerTicketsController {
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
export class StaffTicketsController {
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
