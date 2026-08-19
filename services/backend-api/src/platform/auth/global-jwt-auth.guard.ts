import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '@qnsc-vn/identity';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * The ONLY divergence from `@qnsc-vn/identity`'s real `JwtAuthGuard` is the
 * `@Public()` opt-out gate — every actual verification/denylist step
 * (Bearer signature check via `JwtStrategy`, token + user denylist via
 * `AuthTokenCache`) is delegated to the package's guard unchanged, by
 * composition, not reimplementation. `rally`/`opshub` each wrote a heavier
 * guard because they needed BFF-cookie branching and other product concerns
 * SoloDesk doesn't have yet — this repo adds only what's actually needed.
 */
@Injectable()
export class GlobalJwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly realGuard: JwtAuthGuard,
  ) {}

  canActivate(context: ExecutionContext): Promise<boolean> | boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    return this.realGuard.canActivate(context) as Promise<boolean>;
  }
}
