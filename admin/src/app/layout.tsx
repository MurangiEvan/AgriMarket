import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: { default: 'AgriMarket Admin', template: '%s · AgriMarket Admin' },
  description: 'Verification and moderation dashboard for AgriMarket administrators.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
