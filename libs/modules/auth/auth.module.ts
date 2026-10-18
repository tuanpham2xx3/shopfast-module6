import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Module,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import {
  IsEmail,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from "class-validator";
import { Request, Response } from "express";
import { AccessGuard, RolesGuard, VerifiedGuard } from "./auth.guards";
import { AuthRuntime } from "./auth.runtime";
import { AuthResult } from "./auth.service";

class RegisterDto {
  @IsEmail() email!: string;
  @IsString() @Length(10, 128) password!: string;
  @IsString() @MinLength(1) @MaxLength(100) displayName!: string;
}
class LoginDto {
  @IsEmail() email!: string;
  @IsString() @Length(10, 128) password!: string;
}
class ConfirmDto {
  @IsString() @Length(6, 6) code!: string;
}
class SendVerificationDto {
  @IsEmail() email!: string;
}

function bearer(request: Request): string {
  const value = request.header("authorization");
  if (!value?.startsWith("Bearer ")) return "";
  return value.slice(7);
}
function requireOrigin(request: Request) {
  if (
    request.header("origin") !==
    (process.env.WEB_ORIGIN ?? "http://localhost:5173")
  )
    throw new ForbiddenException();
}
function setRefreshCookie(response: Response, token: string) {
  response.cookie("shopfast_refresh", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/v1/auth",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}
function publicAuth(result: AuthResult) {
  return {
    accessToken: result.accessToken,
    expiresIn: result.expiresIn,
    user: result.user,
    ...(result.verificationRequired === undefined
      ? {}
      : { verificationRequired: result.verificationRequired }),
  };
}

@Controller("auth")
class AuthController {
  constructor(private readonly runtime: AuthRuntime) {}
  @Post("register")
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await (await this.runtime.get()).register(dto);
    setRefreshCookie(response, result.refreshToken);
    return publicAuth(result);
  }
  @Post("login")
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await (
      await this.runtime.get()
    ).login(dto.email, dto.password);
    setRefreshCookie(response, result.refreshToken);
    return publicAuth(result);
  }
  @Post("verification/confirm")
  @HttpCode(200)
  async confirm(@Req() request: Request, @Body() dto: ConfirmDto) {
    return (await this.runtime.get()).confirmVerification(
      bearer(request),
      dto.code,
    );
  }
  @Post("verification/send")
  @HttpCode(202)
  async sendVerification(
    @Body() dto: SendVerificationDto,
    @Req() request: Request,
  ) {
    await (
      await this.runtime.get()
    ).sendVerification(dto.email, request.ip ?? "unknown");
    return { accepted: true };
  }
  @Get("me")
  async me(@Req() request: Request) {
    return (await this.runtime.get()).currentUser(bearer(request));
  }
  @Post("refresh")
  @HttpCode(200)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    requireOrigin(request);
    const result = await (
      await this.runtime.get()
    ).refresh(request.cookies?.shopfast_refresh ?? "");
    setRefreshCookie(response, result.refreshToken);
    return publicAuth(result);
  }
  @Post("logout")
  @HttpCode(204)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    requireOrigin(request);
    await (
      await this.runtime.get()
    ).logout(request.cookies?.shopfast_refresh ?? "");
    response.clearCookie("shopfast_refresh", { path: "/api/v1/auth" });
  }
}

@Module({
  controllers: [AuthController],
  providers: [AuthRuntime, AccessGuard, VerifiedGuard, RolesGuard],
  exports: [AuthRuntime, AccessGuard, VerifiedGuard, RolesGuard],
})
export class AuthModule {}
