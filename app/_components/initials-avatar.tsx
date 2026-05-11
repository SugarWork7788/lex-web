// Reusable colored-circle-with-initial avatar primitive.
// Color is derived from a stable hash of userId so the same user gets
// the same color across navbar + profile + everywhere else.

import { getInitial, getInitialsPalette } from "@/lib/avatars";

export function InitialsAvatar({
  userId,
  displayName,
  size = 40,
  className = "",
}: {
  userId: string;
  displayName: string | null | undefined;
  size?: number;
  className?: string;
}) {
  const { bg, text } = getInitialsPalette(userId);
  const initial = getInitial(displayName);
  // Tailwind doesn't compute font-size from arbitrary `style` props, so we
  // pass it through inline style. Otherwise the small (24px) navbar avatar
  // would have the same font-size as the 80px profile-grid one.
  const fontSize = Math.max(10, Math.round(size * 0.45));
  return (
    <span
      role="img"
      aria-label={displayName ? `Аватар: ${displayName}` : "Аватар"}
      style={{ width: size, height: size, fontSize }}
      className={`inline-flex items-center justify-center rounded-full font-semibold leading-none select-none ${bg} ${text} ${className}`}
    >
      {initial}
    </span>
  );
}
