import { HomePage } from '@/components/home-page';
import { publicPageMetadata, siteDescription, siteTitle, siteUrl } from '@/lib/site-metadata';
export const metadata = publicPageMetadata('/', siteTitle, siteDescription);
export default function Home() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': new URL('/#organization', siteUrl).href,
        name: 'Parius',
        url: siteUrl.href,
        logo: new URL('/apple-icon.png', siteUrl).href,
      },
      {
        '@type': 'WebSite',
        '@id': new URL('/#website', siteUrl).href,
        name: 'Parius',
        url: siteUrl.href,
        description: siteDescription,
      },
      {
        '@type': 'SoftwareApplication',
        name: 'Parius',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        url: siteUrl.href,
        description: siteDescription,
      },
    ],
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, '\\u003c'),
        }}
      />
      <HomePage />
    </>
  );
}
