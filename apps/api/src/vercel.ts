import type { Request, Response } from 'express';
import { createServer } from './bootstrap';

let cached: ReturnType<typeof createServer> | null = null;

// Vercel serverless entry: reuse the Nest app across warm invocations.
export default async function handler(req: Request, res: Response) {
  if (!cached) {
    cached = createServer().catch((err) => {
      cached = null; // next request tries again instead of reusing the failure
      throw err;
    });
  }
  const server = await cached;
  return server(req, res);
}
