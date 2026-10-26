/** Layered records: context preserved, reviewed and carried into the next project. */
export function MemoryMark({
  size = 20,
  className = '',
  strokeWidth = 1.4,
}: {
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="m4 8 8-4 8 4-8 4-8-4Z" />
      <path d="m4 12 8 4 8-4M4 16l8 4 8-4" />
      <path d="M12 8h.01" strokeWidth="2" />
    </svg>
  );
}
