import type { Request, Response } from 'express';
import { createServer } from './bootstrap';

let cached: ReturnType<typeof createServer> | null = null;

// Vercel serverless entry: reuse the Nest app across warm invocations.
export default async function handler(req: Request, res: Response) {
  if (!cached) cached = createServer();
  const server = await cached;
  return server(req, res);
}
