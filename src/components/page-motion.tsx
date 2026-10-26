'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';

/** Short orientation transitions. Content stays visible if scripts or motion are disabled. */
export function PageMotion({
  children,
  animationKey,
  className = '',
}: {
  children: React.ReactNode;
  animationKey?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from(ref.current, {
        y: 10,
        opacity: 0,
        duration: animationKey ? 0.23 : 0.45,
        ease: 'power3.out',
        clearProps: 'transform,opacity',
      });
    });
    return () => media.revert();
  }, [animationKey]);
  return (
    <div ref={ref} className={`min-w-0 ${className}`}>
      {children}
    </div>
  );
}
