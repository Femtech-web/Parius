import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { productDocs } from '@/lib/product-docs';
import { DocumentationArticle } from '@/components/documentation';
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
  return { title: doc?.title ?? 'Documentation', description: doc?.description };
}
export default async function Topic({ params }: { params: Promise<{ topic: string }> }) {
  const { topic } = await params;
  const doc = productDocs.find((item) => item.slug === topic);
  if (!doc) notFound();
  return <DocumentationArticle doc={doc} />;
}
