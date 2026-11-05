import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// No $connect() at startup: Prisma connects on the first query. On Vercel a slow or
// briefly unreachable database then fails that one request instead of the whole function.
@Injectable()
export class PrismaService extends PrismaClient {}
