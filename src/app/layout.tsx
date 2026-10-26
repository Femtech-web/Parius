import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
const satoshi = localFont({
  src: './fonts/Satoshi-Variable.woff2',
  variable: '--font-satoshi',
  weight: '300 900',
  display: 'swap',
});
export const metadata: Metadata = {
  title: { default: 'Parius — On the same page.', template: '%s · Parius' },
  description:
    'A shared workspace for your client conversations, agreements, milestones and payments.',
};
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
