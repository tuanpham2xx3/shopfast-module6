import {
  Body,
  Controller,
  Delete,
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
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsObject,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Matches,
  Min,
  ValidateNested,
} from "class-validator";
import { DataSource } from "typeorm";
import { createDataSource } from "../../platform/src/database/data-source";
import { AuthModule } from "../auth/auth.module";
import {
  AccessGuard,
  AuthenticatedRequest,
  Roles,
  RolesGuard,
  VerifiedGuard,
} from "../auth/auth.guards";
import { OrderService } from "./order.service";

class QuantityDto {
  @IsInt() @Min(1) @Max(99) quantity!: number;
}
class AddCartDto extends QuantityDto {
  @IsUUID() productId!: string;
}
class CheckoutItem extends AddCartDto {
  @IsInt() @Min(0) @Max(Number.MAX_SAFE_INTEGER) expectedUnitPrice!: number;
}
class AddressDto {
  @IsString() @Length(2, 100) recipientName!: string;
  @IsString() @Length(5, 300) addressLine!: string;
  @IsString() @Matches(/^\+?[0-9]{8,15}$/) phone!: string;
  @IsString() @Length(1, 100) ward!: string;
  @IsString() @Length(1, 100) province!: string;
}
class CheckoutDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CheckoutItem)
  items!: CheckoutItem[];
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => AddressDto)
  shippingAddress!: AddressDto;
  @IsOptional() @IsString() @Length(1, 80) promoCode?: string;
}
class VersionDto {
  @IsInt() @Min(1) expectedVersion!: number;
}
class CancelDto extends VersionDto {
  @IsString() @Length(5, 500) reason!: string;
}
class StatusDto extends VersionDto {
  @IsIn(["PROCESSING", "SHIPPING", "DELIVERED"]) targetStatus!: string;
  @IsOptional() @IsString() @Length(0, 500) reason?: string;
}
class ListDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  page?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
  @IsOptional() @IsString() @Length(1, 80) code?: string;
  @IsOptional()
  @IsIn([
    "PENDING_PAYMENT",
    "CONFIRMED",
    "PROCESSING",
    "SHIPPING",
    "DELIVERED",
    "CANCELLED",
    "EXPIRED",
  ])
  status?: string;
}
@Injectable()
class OrderRuntime implements OnApplicationShutdown {
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
    return new OrderService(this.source, process.env.DATABASE_SCHEMA);
  }
  async onApplicationShutdown() {
    if (this.source?.isInitialized) await this.source.destroy();
  }
}
@Controller("cart")
@UseGuards(AccessGuard, VerifiedGuard, RolesGuard)
@Roles("CUSTOMER")
class CartController {
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
class OrdersController {
  constructor(private readonly runtime: OrderRuntime) {}
  @Post() async checkout(
    @Req() r: AuthenticatedRequest,
    @Body() dto: CheckoutDto,
  ) {
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
class StaffOrdersController {
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
class PromotionDto {
  @IsString() @Length(1, 80) code!: string;
  @IsInt() @Min(1) @Max(Number.MAX_SAFE_INTEGER) amount!: number;
  @IsInt() @Min(0) @Max(Number.MAX_SAFE_INTEGER) minOrderAmount!: number;
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
  @IsInt() @Min(1) @Max(2147483647) totalQuota!: number;
}
class PromotionActiveDto {
  @IsBoolean() active!: boolean;
}
@Controller("admin")
@UseGuards(AccessGuard, VerifiedGuard, RolesGuard)
@Roles("ADMIN")
class AdminOrderController {
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
@Module({
  imports: [AuthModule],
  controllers: [
    CartController,
    OrdersController,
    StaffOrdersController,
    AdminOrderController,
  ],
  providers: [OrderRuntime],
})
export class OrderModule {}
