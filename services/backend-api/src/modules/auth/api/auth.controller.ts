import { Body, Controller, Get, HttpCode, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { AuthService, type LoginResult, type JwtPayload } from '@qnsc-vn/identity';
import { Public } from '../../../platform/auth/public.decorator';
import { SkipTenantContext } from '../../../platform/skip-tenant-context.decorator';
import { CurrentUser } from '../../../platform/auth/current-user.decorator';
import { SignupService } from '../application/signup.service';
import { LoginService } from '../application/login.service';
import { SignupDto, LoginDto, GoogleLoginDto, RefreshDto, ForgotPasswordDto, ResetPasswordDto, UpdateMeDto } from './auth.dto';

function clientIp(req: FastifyRequest): string | undefined {
  return (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.ip;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly signupService: SignupService,
    private readonly loginService: LoginService,
    private readonly authService: AuthService,
  ) {}

  @Post('signup')
  @Public()
  @SkipTenantContext()
  @HttpCode(201)
  @ApiOperation({ summary: 'Self-serve signup — creates the tenant, user, and owner membership atomically. No session returned; verify email first.' })
  async signup(@Body() dto: SignupDto, @Req() req: FastifyRequest): Promise<{ message: string }> {
    await this.loginService.checkSignupRateLimit(clientIp(req) ?? 'unknown');
    await this.signupService.signupWithPassword(dto);
    return { message: 'Account created. Check your email to verify it before signing in.' };
  }

  @Get('verify-email')
  @Public()
  @SkipTenantContext()
  @ApiOperation({ summary: 'Verify email from the signup link, auto-login on success' })
  async verifyEmail(@Query('token') token: string): Promise<LoginResult> {
    return this.signupService.verifyEmail(token);
  }

  @Post('login')
  @Public()
  @SkipTenantContext()
  @ApiOperation({ summary: 'Email + password login' })
  async login(@Body() dto: LoginDto, @Req() req: FastifyRequest): Promise<LoginResult> {
    return this.loginService.login(dto.email, dto.password, clientIp(req));
  }

  @Post('google')
  @Public()
  @SkipTenantContext()
  @ApiOperation({ summary: 'Google Sign-In — verifies a client-obtained id_token, creates a new tenant on first login' })
  async google(@Body() dto: GoogleLoginDto, @Req() req: FastifyRequest): Promise<LoginResult> {
    return this.signupService.loginWithGoogle(dto.idToken, clientIp(req));
  }

  @Post('refresh')
  @Public()
  @SkipTenantContext()
  @ApiOperation({ summary: 'Rotate a refresh token for a new access/refresh pair' })
  async refresh(@Body() dto: RefreshDto, @Req() req: FastifyRequest) {
    return this.authService.refresh(dto.refreshToken, dto.csrfToken ?? null, clientIp(req));
  }

  @Post('logout')
  @ApiOperation({ summary: 'End the current session' })
  async logout(@CurrentUser() user: JwtPayload): Promise<{ message: string }> {
    await this.authService.logout(user);
    return { message: 'Logged out.' };
  }

  @Post('logout-all')
  @ApiOperation({ summary: 'End every session for this user, across devices' })
  async logoutAll(@CurrentUser() user: JwtPayload): Promise<{ message: string }> {
    await this.authService.logoutAll(user);
    return { message: 'Logged out everywhere.' };
  }

  @Get('me')
  @ApiOperation({ summary: "Get the authenticated user's own profile" })
  async me(@CurrentUser() user: JwtPayload) {
    return this.authService.getMe(user.sub);
  }

  @Patch('me')
  @ApiOperation({ summary: "Update the authenticated user's own editable profile fields" })
  async updateMe(@CurrentUser() user: JwtPayload, @Body() dto: UpdateMeDto) {
    return this.authService.updateProfile(user.sub, dto);
  }

  @Post('forgot-password')
  @Public()
  @SkipTenantContext()
  @HttpCode(200)
  @ApiOperation({ summary: 'Request a password reset link — always succeeds, no email-enumeration leak' })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ message: string }> {
    await this.loginService.checkForgotPasswordRateLimit(dto.email);
    await this.signupService.forgotPassword(dto.email);
    return { message: 'If an account exists for that email, a reset link has been sent.' };
  }

  @Post('reset-password')
  @Public()
  @SkipTenantContext()
  @ApiOperation({ summary: 'Reset password from the emailed link — revokes every existing session' })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ message: string }> {
    await this.signupService.resetPassword(dto.token, dto.newPassword);
    return { message: 'Password updated. Please sign in again.' };
  }
}
