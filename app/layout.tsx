import type { Metadata } from 'next';
import Script from 'next/script';
import type { ReactNode } from 'react';
import '../src/index.css';
import AppShell from '../src/components/AppShell';
import { SITE } from '../src/constants/author';

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: SITE.title,
    template: `%s | ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  alternates: {
    canonical: '/',
    types: { 'application/rss+xml': '/rss.xml' },
  },
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    url: '/',
    siteName: SITE.name,
    title: SITE.title,
    description: SITE.description,
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE.title,
    description: SITE.description,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  icons: { icon: '/icon.svg' },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const adsenseClient = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Noto+Sans+KR:wght@300;400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased selection:bg-indigo-100 selection:text-indigo-900">
        {adsenseClient && (
          <Script
            id="adsbygoogle-loader"
            async
            crossOrigin="anonymous"
            strategy="afterInteractive"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClient}`}
          />
        )}
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
