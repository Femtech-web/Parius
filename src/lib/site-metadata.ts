import type { Metadata } from 'next';

const configuredOrigin =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000');
export const siteUrl = new URL(new URL(configuredOrigin).origin);
export const siteTitle = 'Parius — Keep freelance work and payments connected';
export const siteDescription =
  'Keep client conversations, approved agreements, milestones and payments together. Recall useful lessons and hand over final files with clear conditions.';
export const socialImage = {
  url: '/og.png',
  width: 1200,
  height: 630,
  alt: 'Parius — Keep the work, the agreement and the payment connected.',
};

export function publicPageMetadata(path: string, title: string, description: string): Metadata {
  const fullTitle = path === '/' ? siteTitle : `${title} · Parius`;
  return {
    title: path === '/' ? { absolute: fullTitle } : title,
    description,
    alternates: { canonical: path },
    robots: { index: true, follow: true },
    openGraph: {
      type: 'website',
      siteName: 'Parius',
      locale: 'en_US',
      url: path,
      title: fullTitle,
      description,
      images: [socialImage],
    },
    twitter: { card: 'summary_large_image', title: fullTitle, description, images: [socialImage] },
  };
}
