import {
  IsEmail,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from "class-validator";

export class RegisterDto {
  @IsEmail() email!: string;
  @IsString() @Length(10, 128) password!: string;
  @IsString() @MinLength(1) @MaxLength(100) displayName!: string;
}

export class LoginDto {
  @IsEmail() email!: string;
  @IsString() @Length(10, 128) password!: string;
}

export class ConfirmDto {
  @IsString() @Length(6, 6) code!: string;
}

export class SendVerificationDto {
  @IsEmail() email!: string;
}
