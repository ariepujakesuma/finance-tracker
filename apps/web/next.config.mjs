/** @type {import('next').NextConfig} */
const api = (process.env.API_URL || 'http://localhost:4000').replace(/\/$/, '');

export default {
  // Browser always calls /api/* on this domain; Next.js proxies to the NestJS API.
  // Same origin means the session cookie just works, no CORS.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${api}/:path*` }];
  },
  poweredByHeader: false,
};
