import {
  Body,
  Controller,
  Get,
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
import { CatalogRuntime } from "../composition/catalog.runtime";
import {
  AdjustmentDto,
  InventoryDto,
  PageDto,
  ProductDto,
  ProductPatchDto,
  ProductsDto,
  TaxonomyDto,
  TaxonomyPatchDto,
} from "./catalog.dto";

@Controller()
export class CatalogController {
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
export class CatalogAdminController {
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
export class InventoryController {
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
