import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { productDocs } from '@/features/documentation/content';
import { DocumentationArticle } from '@/features/documentation/components/documentation';
import { publicPageMetadata } from '@/lib/site-metadata';
export function generateStaticParams() {
  return productDocs.map((doc) => ({ topic: doc.slug }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ topic: string }>;
}): Promise<Metadata> {
  const { topic } = await params;
  const doc = productDocs.find((item) => item.slug === topic);
  if (!doc) return { title: 'Documentation', robots: { index: false, follow: false } };
  return publicPageMetadata(`/docs/${doc.slug}`, doc.title, doc.description);
}
export default async function Topic({ params }: { params: Promise<{ topic: string }> }) {
  const { topic } = await params;
  const doc = productDocs.find((item) => item.slug === topic);
  if (!doc) notFound();
  return <DocumentationArticle doc={doc} />;
}
