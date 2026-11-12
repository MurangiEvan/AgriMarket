import type { NextConfig } from 'next';

// The admin website has no backend of its own. Every /api/v1 request is forwarded to the
// AgriMarket API on Render, so the browser only ever talks to this site's own domain and the
// sign-in cookies stay first-party (browsers block third-party cookies).
const apiOrigin = (process.env.AGRIMARKET_API_ORIGIN ?? 'https://agrimarket-f059.onrender.com').replace(/\/$/, '');

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${apiOrigin}/api/v1/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          // Keep the admin website out of search engines.
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ];
  },
};

export default nextConfig;
