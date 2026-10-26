import type { Member } from '@/lib/domain';

export function ProjectRole({ role }: { role?: Member['role'] }) {
  if (!role) return null;
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-ice/15 bg-ice/5 px-2.5 py-1 text-[11px] font-normal leading-none text-ice">
      You’re the {role}
    </span>
  );
}
