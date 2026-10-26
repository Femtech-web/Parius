import type { MetadataRoute } from 'next';
import { productDocs } from '@/lib/product-docs';
import { siteUrl } from '@/lib/site-metadata';

export default function sitemap(): MetadataRoute.Sitemap {
  return ['/', '/docs', '/guide', ...productDocs.map((doc) => `/docs/${doc.slug}`)].map((path) => ({
    url: new URL(path, siteUrl).href,
  }));
}
