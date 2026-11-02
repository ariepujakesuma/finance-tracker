import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import express, { Express } from 'express';
import { AppModule } from './app.module';

// BigInt (Holding.value) is not JSON-serialisable by default.
(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function () {
  return Number(this);
};

export function configure(app: INestApplication) {
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // Web app calls the API through its own /api rewrite (same origin),
  // so CORS is only needed for local development against a different port.
  const origin = process.env.WEB_ORIGIN;
  if (origin) app.enableCors({ origin, credentials: true });
}

export async function createServer(): Promise<Express> {
  const server = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    logger: ['error', 'warn'],
  });
  configure(app);
  await app.init();
  return server;
}
