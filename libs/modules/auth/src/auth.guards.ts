import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { PublicUser } from "./auth.service";
import { AuthRuntime } from "./auth.runtime";

export type AuthenticatedRequest = Request & { user?: PublicUser };
export const Roles = (...roles: string[]) => SetMetadata("roles", roles);

function bearer(request: Request): string {
  const value =
    request.header?.("authorization") ?? request.headers?.authorization;
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return "";
  return value.slice(7);
}

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(private readonly runtime: AuthRuntime) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearer(request);
    if (!token) throw new UnauthorizedException();
    try {
      request.user = await (await this.runtime.get()).currentUser(token);
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}

@Injectable()
export class VerifiedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user?.verified) throw new ForbiddenException();
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<string[]>("roles", [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user || !roles.includes(user.role)) throw new ForbiddenException();
    return true;
  }
}
