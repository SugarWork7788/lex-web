// Server Component wrapper for <VoteButton>. Decides anon vs authed once on the
// server (no hydration flash) and passes the user prop down to the client
// island. Per 06.1-CONTEXT.md D-01.

import { getSession } from "@/lib/supabase-auth";
import { VoteButton } from "./vote-button";

type Props = {
  findingId: string;
  initialCount: number;
  currentPath: string;
};

export async function VoteButtonServer({
  findingId,
  initialCount,
  currentPath,
}: Props) {
  const user = await getSession();
  return (
    <VoteButton
      findingId={findingId}
      initialCount={initialCount}
      user={user ? { id: user.id } : null}
      currentPath={currentPath}
    />
  );
}
