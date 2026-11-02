import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { AuthGuard } from './auth/auth.guard';
import { FinanceController } from './finance/finance.controller';
import { FinanceService } from './finance/finance.service';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController, AuthController, FinanceController],
  providers: [PrismaService, AuthService, AuthGuard, FinanceService],
})
export class AppModule {}
