import {
  Body,
  Controller,
  Delete,
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
} from "../../../auth/src/auth.guards";
import { RuntimeServices } from "../../../runtime/src/composition/runtime.runtime";
import { OrderRuntime } from "../composition/orders.runtime";
import {
  AddCartDto,
  CancelDto,
  CheckoutDto,
  ListDto,
  PromotionActiveDto,
  PromotionDto,
  QuantityDto,
  StatusDto,
  VersionDto,
} from "./orders.dto";

@Controller("cart")
@UseGuards(AccessGuard, VerifiedGuard, RolesGuard)
@Roles("CUSTOMER")
export class CartController {
  constructor(private readonly runtime: OrderRuntime) {}
  @Get() async get(@Req() r: AuthenticatedRequest) {
    return (await this.runtime.get()).cart(r.user!.id);
  }
  @Post("items") async add(
    @Req() r: AuthenticatedRequest,
    @Body() dto: AddCartDto,
  ) {
    return (await this.runtime.get()).addCart(
      r.user!.id,
      dto.productId,
      dto.quantity,
    );
  }
  @Patch("items/:id") async set(
    @Req() r: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: QuantityDto,
  ) {
    return (await this.runtime.get()).setCart(r.user!.id, id, dto.quantity);
  }
  @Delete("items/:id") @HttpCode(204) async remove(
    @Req() r: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    await (await this.runtime.get()).removeCart(r.user!.id, id);
  }
}

@Controller("orders")
@UseGuards(AccessGuard, VerifiedGuard, RolesGuard)
@Roles("CUSTOMER")
export class OrdersController {
  constructor(
    private readonly runtime: OrderRuntime,
    private readonly protections: RuntimeServices,
  ) {}
  @Post() async checkout(
    @Req() r: AuthenticatedRequest,
    @Body() dto: CheckoutDto,
  ) {
    const { limiter } = await this.protections.get();
    await limiter.consume("checkout", r.user!.id, 10, 60000);
    if (dto.promoCode)
      await limiter.consume("checkout-promo", r.user!.id, 3, 60000, true);
    return (await this.runtime.get()).checkout(
      r.user!.id,
      r.header("idempotency-key") ?? "",
      dto,
    );
  }
  @Get() async list(@Req() r: AuthenticatedRequest, @Query() q: ListDto) {
    return (await this.runtime.get()).list(
      r.user!.id,
      q.status,
      q.page,
      q.pageSize,
      q.code,
    );
  }
  @Get(":id") async detail(
    @Req() r: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return (await this.runtime.get()).detail(id, r.user!.id);
  }
  @Post(":id/mock-payment") @HttpCode(200) async pay(
    @Req() r: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: VersionDto,
  ) {
    return (await this.runtime.get()).transition(
      id,
      r.user!,
      "CONFIRMED",
      dto.expectedVersion,
      r.header("idempotency-key") ?? "",
    );
  }
  @Post(":id/cancel") @HttpCode(200) async cancel(
    @Req() r: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CancelDto,
  ) {
    return (await this.runtime.get()).transition(
      id,
      r.user!,
      "CANCELLED",
      dto.expectedVersion,
      r.header("idempotency-key") ?? "",
      dto.reason,
    );
  }
}

@Controller("staff/orders")
@UseGuards(AccessGuard, VerifiedGuard, RolesGuard)
@Roles("WAREHOUSE", "ADMIN")
export class StaffOrdersController {
  constructor(private readonly runtime: OrderRuntime) {}
  @Get() async list(@Query() q: ListDto) {
    return (await this.runtime.get()).list(
      undefined,
      q.status,
      q.page,
      q.pageSize,
      q.code,
    );
  }
  @Get(":id") async detail(@Param("id", ParseUUIDPipe) id: string) {
    return (await this.runtime.get()).detail(id);
  }
  @Patch(":id/status") async status(
    @Req() r: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: StatusDto,
  ) {
    return (await this.runtime.get()).transition(
      id,
      r.user!,
      dto.targetStatus,
      dto.expectedVersion,
      r.header("idempotency-key") ?? "",
      dto.reason,
    );
  }
}

@Controller("admin")
@UseGuards(AccessGuard, VerifiedGuard, RolesGuard)
@Roles("ADMIN")
export class AdminOrderController {
  constructor(private readonly runtime: OrderRuntime) {}
  @Post("promotions") async create(@Body() dto: PromotionDto) {
    return (await this.runtime.get()).createPromotion(dto);
  }
  @Patch("promotions/:id") async active(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: PromotionActiveDto,
  ) {
    return (await this.runtime.get()).setPromotion(id, dto.active);
  }
  @Post("orders/:id/cancel") @HttpCode(200) async cancel(
    @Req() r: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CancelDto,
  ) {
    return (await this.runtime.get()).transition(
      id,
      r.user!,
      "CANCELLED",
      dto.expectedVersion,
      r.header("idempotency-key") ?? "",
      dto.reason,
    );
  }
}
