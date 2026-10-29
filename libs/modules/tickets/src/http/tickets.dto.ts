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
import { categories } from "../tickets.service";

export class PageDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class FilterDto extends PageDto {
  @IsOptional()
  @IsIn(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"])
  status?: string;
  @IsOptional() @IsIn(categories) category?: string;
  @IsOptional() @IsUUID() assignedTo?: string;
}

export class CreateDto {
  @IsString() @Length(5, 150) subject!: string;
  @IsString() @Length(1, 4000) body!: string;
  @IsOptional() @IsUUID() orderId?: string;
}

export class MessageDto {
  @IsString() @Length(1, 4000) body!: string;
  @IsOptional() @IsUUID() approvedAiMessageId?: string;
}

export class VersionDto {
  @IsInt() @Min(1) expectedVersion!: number;
}

export class ClaimDto extends VersionDto {
  @IsOptional() @IsUUID() agentId?: string;
}

export class UpdateDto extends VersionDto {
  @IsOptional()
  @IsIn(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"])
  status?: string;
  @IsOptional() @IsIn(categories) category?: string;
}

export class AiMessageDto {
  @IsString() @Length(1, 4000) message!: string;
  @IsUUID() clientMessageId!: string;
}

export class ConfirmDto extends VersionDto {
  @Equals(true) confirm!: boolean;
}
