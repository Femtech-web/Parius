import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { siteUrl, siteTitle, siteDescription, socialImage } from '@/lib/site-metadata';
import './globals.css';
const satoshi = localFont({
  src: './fonts/Satoshi-Variable.woff2',
  variable: '--font-satoshi',
  weight: '300 900',
  display: 'swap',
});
export const metadata: Metadata = {
  metadataBase: siteUrl,
  applicationName: 'Parius',
  title: { default: siteTitle, template: '%s · Parius' },
  description: siteDescription,
  // Public pages explicitly opt in; private routes inherit noindex.
  robots: { index: false, follow: false },
  openGraph: {
    type: 'website',
    siteName: 'Parius',
    title: siteTitle,
    description: siteDescription,
    images: [socialImage],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteTitle,
    description: siteDescription,
    images: [socialImage],
  },
};
export const viewport: Viewport = { themeColor: '#090b0c', colorScheme: 'dark' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={satoshi.variable}>
      <body>
        <a
          className="fixed top-[-80px] left-4 z-50 rounded-full bg-paper px-5 py-3 text-night focus:top-4"
          href="#main"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
