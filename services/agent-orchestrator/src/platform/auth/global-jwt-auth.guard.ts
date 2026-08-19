import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '@qnsc-vn/identity';
import { IS_PUBLIC_KEY } from './public.decorator';

/** Same shape as backend-api/connector-hub's guard of the same name. */
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
