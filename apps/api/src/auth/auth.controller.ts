import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ChangePinDto, LoginDto, ResetPinDto, SetupDto } from './auth.dto';
import { tokenFrom } from './auth.guard';
import { AuthService, COOKIE } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  private issue(res: Response, token: string) {
    res.cookie(COOKIE, token, this.auth.cookieOptions());
    return { ok: true };
  }

  @Get('status')
  status(@Req() req: Request) {
    return this.auth.status(tokenFrom(req));
  }

  @Post('setup')
  async setup(@Body() dto: SetupDto, @Res({ passthrough: true }) res: Response) {
    return this.issue(res, await this.auth.setup(dto.pin, dto.hint, dto.setupKey));
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    return this.issue(res, await this.auth.login(dto.pin));
  }

  @Post('change')
  @HttpCode(200)
  async change(@Body() dto: ChangePinDto, @Res({ passthrough: true }) res: Response) {
    return this.issue(res, await this.auth.change(dto.oldPin, dto.newPin, dto.hint));
  }

  @Post('reset')
  @HttpCode(200)
  async reset(@Body() dto: ResetPinDto, @Res({ passthrough: true }) res: Response) {
    return this.issue(res, await this.auth.reset(dto.setupKey, dto.newPin, dto.hint));
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    const { maxAge, ...opts } = this.auth.cookieOptions();
    res.clearCookie(COOKIE, opts);
    return { ok: true };
  }
}
