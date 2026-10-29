import { OmitType, PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
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

export class PageDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  page?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class ProductsDto extends PageDto {
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

export class TaxonomyDto {
  @IsString() @Length(1, 100) @Matches(/\S/) name!: string;
  @IsString()
  @Length(1, 120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;
}

export class TaxonomyPatchDto {
  @IsOptional() @IsString() @Length(1, 100) @Matches(/\S/) name?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class ProductDto {
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

export class ProductPatchDto extends PartialType(
  OmitType(ProductDto, ["sku"] as const),
) {
  @IsInt() @Min(1) expectedVersion!: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class InventoryDto extends PageDto {
  @IsOptional() @IsString() @Length(1, 80) sku?: string;
}

export class AdjustmentDto {
  @IsInt() @Min(-2147483647) @Max(2147483647) delta!: number;
  @IsString() @Length(5, 500) reason!: string;
  @IsInt() @Min(1) expectedVersion!: number;
}
