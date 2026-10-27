import Link from 'next/link';
export function Brand({ className = '' }: { light?: boolean; className?: string }) {
  return (
    <Link
      href="/"
      aria-label="Parius home"
      className={`inline-flex w-fit items-center text-[30px] font-medium tracking-[-.08em] text-paper ${className}`}
    >
      parius<span className="text-ice">.</span>
    </Link>
  );
}
