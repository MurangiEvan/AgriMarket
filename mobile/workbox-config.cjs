module.exports = {
  globDirectory: 'dist',
  globPatterns: ['**/*.{html,js,css,json,ico,svg,png,woff2}'],
  swDest: 'dist/sw.js',
  clientsClaim: false,
  skipWaiting: false,
  navigateFallback: '/offline.html',
  navigateFallbackDenylist: [/^\/api\//],
  runtimeCaching: [
    {
      urlPattern: ({ request, url }) =>
        request.method === 'GET' &&
        /^\/api\/v1\/(categories|listings(?:\/[0-9a-f-]+)?)$/.test(url.pathname),
      handler: 'NetworkFirst',
      options: {
        cacheName: 'agrimarket-public-api',
        networkTimeoutSeconds: 3,
        expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 },
      },
    },
    {
      urlPattern: ({ request, url }) =>
        url.origin === self.location.origin && ['font', 'image', 'script', 'style'].includes(request.destination),
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'agrimarket-static-assets',
        expiration: { maxEntries: 60, maxAgeSeconds: 7 * 24 * 60 * 60 },
      },
    },
  ],
};