import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsDefined,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

export class QuantityDto {
  @IsInt() @Min(1) @Max(99) quantity!: number;
}

export class AddCartDto extends QuantityDto {
  @IsUUID() productId!: string;
}

export class CheckoutItem extends AddCartDto {
  @IsInt() @Min(0) @Max(Number.MAX_SAFE_INTEGER) expectedUnitPrice!: number;
}

export class AddressDto {
  @IsString() @Length(2, 100) recipientName!: string;
  @IsString() @Length(5, 300) addressLine!: string;
  @IsString() @Matches(/^\+?[0-9]{8,15}$/) phone!: string;
  @IsString() @Length(1, 100) ward!: string;
  @IsString() @Length(1, 100) province!: string;
}

export class CheckoutDto {
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

export class VersionDto {
  @IsInt() @Min(1) expectedVersion!: number;
}

export class CancelDto extends VersionDto {
  @IsString() @Length(5, 500) reason!: string;
}

export class StatusDto extends VersionDto {
  @IsIn(["PROCESSING", "SHIPPING", "DELIVERED"]) targetStatus!: string;
  @IsOptional() @IsString() @Length(0, 500) reason?: string;
}

export class ListDto {
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

export class PromotionDto {
  @IsString() @Length(1, 80) code!: string;
  @IsInt() @Min(1) @Max(Number.MAX_SAFE_INTEGER) amount!: number;
  @IsInt() @Min(0) @Max(Number.MAX_SAFE_INTEGER) minOrderAmount!: number;
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
  @IsInt() @Min(1) @Max(2147483647) totalQuota!: number;
}

export class PromotionActiveDto {
  @IsBoolean() active!: boolean;
}
