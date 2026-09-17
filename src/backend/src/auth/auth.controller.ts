import { Controller, Get, HttpCode, HttpStatus, Post, Query, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import type { AuthenticatedRequest } from '../common/security/authenticated-request';
import { AuthService } from './auth.service';
import { AuthCallbackQueryDto } from './dto/auth-callback-query.dto';
import type { AccessTokenResponseDto } from './dto/access-token-response.dto';
import { SessionInfoDto } from './dto/session-info.dto';
import { OriginAllowlistGuard } from './guards/origin-allowlist.guard';

/**
 * `AuthController` (ADR-0002 Teil B §12, Schicht-Split `backend-lead`-Votum
 * F1) — DÜNN: nur Request-/Response-/Cookie-Mechanik, keine Business-Logik
 * (`.claude/rules/backend-nestjs.md`). Fach-Orchestrierung liegt vollständig
 * in `AuthService`. Endpoints exakt nach `schemas/openapi/auth.openapi.yaml`.
 *
 * `ThrottlerGuard` (`@nestjs/throttler`) auf Controller-Ebene: "Rate-Limiting
 * deckt 401 UND 403 auf den Auth-Pfaden" (ADR-0002 §12). Konkrete
 * Limits/Fenster sind Platzhalter (`AuthModule`s `ThrottlerModule.forRoot`)
 * — Tuning ist `security-lead`-Sache, s. finale Antwort.
 */
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Get('login')
  async login(@Res() response: Response): Promise<void> {
    const { location, authTxCookie } = await this.authService.buildLoginRedirect();
    response.setHeader('Set-Cookie', authTxCookie);
    response.redirect(HttpStatus.FOUND, location);
  }

  @Public()
  @Get('callback')
  async callback(
    @Query() query: AuthCallbackQueryDto,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const outcome = await this.authService.handleCallback(query, request.headers.cookie);
    response.setHeader('Set-Cookie', [outcome.refreshCookie, outcome.clearAuthTxCookie]);
    response.redirect(HttpStatus.FOUND, outcome.location);
  }

  @Public()
  @UseGuards(OriginAllowlistGuard)
  @Post('refresh')
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AccessTokenResponseDto> {
    const outcome = await this.authService.refresh(request.headers.cookie);
    response.setHeader('Set-Cookie', outcome.refreshCookie);
    return outcome.accessToken;
  }

  @Public()
  @UseGuards(OriginAllowlistGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<void> {
    const deleteCookie = await this.authService.logout(request.headers.cookie);
    response.setHeader('Set-Cookie', deleteCookie);
  }

  /** Bearer-geschützt (Default-Security, kein `@Public()`) — läuft über den globalen `JwtAuthGuard`. */
  @Get('session')
  session(@Req() request: AuthenticatedRequest): SessionInfoDto {
    const securityContext = request.securityContext;
    if (securityContext === undefined) {
      // Sollte strukturell nicht vorkommen (JwtAuthGuard laesst nur
      // vollstaendig validierte Requests durch) -- fail-closed defensiv.
      throw new UnauthorizedException('kein_security_context');
    }

    return new SessionInfoDto({
      sub: securityContext.sub,
      actorTyp: securityContext.actorTyp,
      roles: securityContext.roles,
    });
  }
}
