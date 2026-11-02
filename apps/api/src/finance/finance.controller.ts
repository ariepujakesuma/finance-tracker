import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { EntryDto, GoldPriceDto, HoldingDto, MonthDto, SettingsDto } from './finance.dto';
import { FinanceService } from './finance.service';

@Controller()
export class FinanceController {
  constructor(private finance: FinanceService) {}

  @UseGuards(AuthGuard) @Get('finance')
  all() {
    return this.finance.all();
  }

  @UseGuards(AuthGuard) @Post('entries')
  createEntry(@Body() dto: EntryDto) {
    return this.finance.createEntry(dto);
  }

  @UseGuards(AuthGuard) @Put('entries/:id')
  updateEntry(@Param('id') id: string, @Body() dto: EntryDto) {
    return this.finance.updateEntry(id, dto);
  }

  @UseGuards(AuthGuard) @Delete('entries/:id')
  deleteEntry(@Param('id') id: string) {
    return this.finance.deleteEntry(id);
  }

  @UseGuards(AuthGuard) @Put('months/:key')
  saveMonth(@Param('key') key: string, @Body() dto: MonthDto) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) throw new BadRequestException('Format bulan harus YYYY-MM.');
    return this.finance.saveMonth(key, dto);
  }

  @UseGuards(AuthGuard) @Post('holdings')
  createHolding(@Body() dto: HoldingDto) {
    return this.finance.createHolding(dto);
  }

  @UseGuards(AuthGuard) @Put('holdings/:id')
  updateHolding(@Param('id') id: string, @Body() dto: HoldingDto) {
    return this.finance.updateHolding(id, dto);
  }

  @UseGuards(AuthGuard) @Delete('holdings/:id')
  deleteHolding(@Param('id') id: string) {
    return this.finance.deleteHolding(id);
  }

  @UseGuards(AuthGuard) @Put('settings')
  saveSettings(@Body() dto: SettingsDto) {
    return this.finance.saveSettings(dto);
  }

  /** For an automated job: POST /gold-price with header x-cron-secret. */
  @Post('gold-price') @HttpCode(200)
  goldPrice(@Headers('x-cron-secret') secret: string, @Body() dto: GoldPriceDto) {
    const expected = process.env.CRON_SECRET;
    if (!expected || secret !== expected) throw new ForbiddenException('Secret salah.');
    return this.finance.setGoldPrice(dto);
  }
}
