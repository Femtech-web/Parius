// Shared Tailwind primitives keep control sizing and interaction consistent across the app.
const button =
  'inline-flex min-h-11 shrink-0 items-center justify-center gap-2.5 rounded-full font-medium transition-[background-color,color,border-color,transform] duration-150 motion-safe:active:scale-[.98] disabled:pointer-events-none disabled:opacity-40';
const primary = 'bg-ice text-night hover:bg-paper';
const secondary =
  'border border-white/15 bg-transparent text-paper hover:border-white/30 hover:bg-white/5';
const regular = 'px-5 py-3 text-[13px]';
const small = 'px-4 py-2 text-xs';
export const control = {
  primary: `${button} ${regular} ${primary}`,
  secondary: `${button} ${regular} ${secondary}`,
  smallPrimary: `${button} ${primary} ${small}`,
  smallSecondary: `${button} ${secondary} ${small}`,
};
