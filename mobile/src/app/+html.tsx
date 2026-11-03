import { useServerDocumentContext } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function RootDocument({ children }: PropsWithChildren) {
  const { headNodes, bodyNodes, htmlAttributes, bodyAttributes } = useServerDocumentContext();

  return (
    <html lang="en" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="description" content="Discover verified South African farmers and suppliers on AgriMarket." />
        <meta name="theme-color" content="#183f32" />
        <meta name="mobile-web-app-capable" content="yes" />
        <title>AgriMarket</title>
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/agrimarket-icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/agrimarket-icon-180.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `if ('serviceWorker' in navigator && location.protocol === 'https:') { window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); }); }`,
          }}
        />
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}