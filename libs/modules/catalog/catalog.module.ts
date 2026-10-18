import {
  Body,
  Controller,
  Get,
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
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Length,
  Matches,
  Max,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
import { OmitType, PartialType } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { createDataSource } from "../../platform/src/database/data-source";
import {
  AccessGuard,
  AuthenticatedRequest,
  Roles,
  RolesGuard,
  VerifiedGuard,
} from "../auth/auth.guards";
import { AuthModule } from "../auth/auth.module";
import { CatalogService } from "./catalog.service";

class PageDto {
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
}
class ProductsDto extends PageDto {
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() brandId?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  minPrice?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  maxPrice?: number;
  @IsOptional() @IsIn(["newest", "price_asc", "price_desc"]) sort?:
    | "newest"
    | "price_asc"
    | "price_desc";
}
class TaxonomyDto {
  @IsString() @Length(1, 100) @Matches(/\S/) name!: string;
  @IsString()
  @Length(1, 120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;
}
class TaxonomyPatchDto {
  @IsOptional() @IsString() @Length(1, 100) @Matches(/\S/) name?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
class ProductDto {
  @IsString() @Length(1, 80) @Matches(/^[A-Za-z0-9_-]+$/) sku!: string;
  @IsString()
  @Length(1, 120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;
  @IsString() @Length(1, 200) @Matches(/\S/) name!: string;
  @IsString() @Length(0, 10000) description!: string;
  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  @Length(1, 2048)
  imageUrl!: string;
  @IsUUID() categoryId!: string;
  @IsUUID() brandId!: string;
  @IsInt() @Min(0) @Max(Number.MAX_SAFE_INTEGER) price!: number;
}
class ProductPatchDto extends PartialType(
  OmitType(ProductDto, ["sku"] as const),
) {
  @IsInt() @Min(1) expectedVersion!: number;
  @IsOptional() @IsBoolean() active?: boolean;
}
class InventoryDto extends PageDto {
  @IsOptional() @IsString() @Length(1, 80) sku?: string;
}
class AdjustmentDto {
  @IsInt() @Min(-2147483647) @Max(2147483647) delta!: number;
  @IsString() @Length(5, 500) reason!: string;
  @IsInt() @Min(1) expectedVersion!: number;
}

@Injectable()
class CatalogRuntime implements OnApplicationShutdown {
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
    return new CatalogService(this.source, process.env.DATABASE_SCHEMA);
  }
  async onApplicationShutdown() {
    if (this.source?.isInitialized) await this.source.destroy();
  }
}
@Controller()
class CatalogController {
  constructor(private readonly runtime: CatalogRuntime) {}
  @Get("categories") async categories() {
    return (await this.runtime.get()).taxonomy("categories");
  }
  @Get("brands") async brands() {
    return (await this.runtime.get()).taxonomy("brands");
  }
  @Get("products") async products(@Query() query: ProductsDto) {
    return (await this.runtime.get()).products(query);
  }
  @Get("products/:id") async product(@Param("id", ParseUUIDPipe) id: string) {
    return (await this.runtime.get()).product(id);
  }
}
@Controller("admin")
@UseGuards(AccessGuard, VerifiedGuard, RolesGuard)
@Roles("ADMIN")
class CatalogAdminController {
  constructor(private readonly runtime: CatalogRuntime) {}
  @Post("categories") async category(@Body() dto: TaxonomyDto) {
    return (await this.runtime.get()).createTaxonomy("categories", dto);
  }
  @Post("brands") async brand(@Body() dto: TaxonomyDto) {
    return (await this.runtime.get()).createTaxonomy("brands", dto);
  }
  @Patch("categories/:id") async updateCategory(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: TaxonomyPatchDto,
  ) {
    return (await this.runtime.get()).updateTaxonomy("categories", id, dto);
  }
  @Patch("brands/:id") async updateBrand(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: TaxonomyPatchDto,
  ) {
    return (await this.runtime.get()).updateTaxonomy("brands", id, dto);
  }
  @Post("products") async product(@Body() dto: ProductDto) {
    return (await this.runtime.get()).createProduct(dto);
  }
  @Patch("products/:id") async updateProduct(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ProductPatchDto,
  ) {
    return (await this.runtime.get()).updateProduct(id, dto);
  }
}
@Controller("staff/inventory")
@UseGuards(AccessGuard, VerifiedGuard, RolesGuard)
@Roles("WAREHOUSE", "ADMIN")
class InventoryController {
  constructor(private readonly runtime: CatalogRuntime) {}
  @Get() async list(@Query() query: InventoryDto) {
    return (await this.runtime.get()).inventory(query);
  }
  @Post(":id/adjustments") async adjust(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AdjustmentDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return (await this.runtime.get()).adjust(
      id,
      request.user!.id,
      request.header("idempotency-key") ?? "",
      dto,
    );
  }
  @Get(":id/movements") async movements(
    @Param("id", ParseUUIDPipe) id: string,
    @Query() query: PageDto,
  ) {
    return (await this.runtime.get()).movements(id, query);
  }
}
@Module({
  imports: [AuthModule],
  controllers: [CatalogController, CatalogAdminController, InventoryController],
  providers: [CatalogRuntime],
})
export class CatalogModule {}
