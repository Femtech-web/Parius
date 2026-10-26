import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site-metadata';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/dashboard',
        '/projects',
        '/invite',
        '/login',
        '/auth',
        '/wallet',
        '/preview',
        '/api/',
      ],
    },
    sitemap: new URL('/sitemap.xml', siteUrl).href,
  };
}
