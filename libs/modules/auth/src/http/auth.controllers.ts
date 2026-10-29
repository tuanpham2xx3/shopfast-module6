import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { Request, Response } from "express";
import { RuntimeServices } from "../../../runtime/src/composition/runtime.runtime";
import { AuthRuntime } from "../auth.runtime";
import { AuthError, AuthResult } from "../auth.service";
import {
  ConfirmDto,
  LoginDto,
  RegisterDto,
  SendVerificationDto,
} from "./auth.dto";

export function bearer(request: Request): string {
  const value = request.header("authorization");
  if (!value?.startsWith("Bearer ")) return "";
  return value.slice(7);
}

export function requireOrigin(request: Request) {
  if (
    request.header("origin") !==
    (process.env.WEB_ORIGIN ?? "http://127.0.0.1:5173")
  )
    throw new ForbiddenException();
}

export function setRefreshCookie(response: Response, token: string) {
  response.cookie("shopfast_refresh", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/v1/auth",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function publicAuth(result: AuthResult) {
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
export class AuthController {
  constructor(
    private readonly runtime: AuthRuntime,
    private readonly protections: RuntimeServices,
  ) {}
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
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { limiter } = await this.protections.get();
    await limiter.consume("login-ip", request.ip ?? "unknown", 5, 60000, true);
    await limiter.loginTarget(dto.email, "check");
    let result: AuthResult;
    try {
      result = await (await this.runtime.get()).login(dto.email, dto.password);
    } catch (error) {
      if (error instanceof AuthError && error.code === "INVALID_CREDENTIALS")
        await limiter.loginTarget(dto.email, "failure");
      throw error;
    }
    await limiter.loginTarget(dto.email, "reset");
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
