import { DEFAULT_AVATAR_ID } from "@/lib/avatars";
import { requireAuth } from "@/lib/require-auth";
import { createServerSupabase } from "@/lib/supabase-auth";
import { AvatarPicker } from "./avatar-picker";
import { ProfileSignOutButton } from "./sign-out-button";

// Bulgarian-locale + Sofia TZ formatter — matches /dv pages convention.
const dateFormatter = new Intl.DateTimeFormat("bg-BG", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "Europe/Sofia",
});

export default async function ProfilePage() {
  const user = await requireAuth("/profile");

  const supabase = await createServerSupabase();
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("display_name, created_at, avatar_id")
    .eq("id", user.id)
    .single();

  const displayName = profile?.display_name ?? user.email?.split("@")[0] ?? "Анонимен";
  const createdAt = profile?.created_at ?? user.created_at;
  const avatarId = profile?.avatar_id ?? DEFAULT_AVATAR_ID;
  const googleAvatarUrl =
    (user.user_metadata as { avatar_url?: string } | undefined)?.avatar_url ?? null;

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="font-serif text-4xl font-bold text-stone-900 dark:text-stone-100">
        Профил
      </h1>
      <p className="mt-2 text-stone-600 dark:text-stone-400">
        Информация за акаунта Ви
      </p>

      <dl className="mt-8 divide-y divide-stone-200 dark:divide-stone-800 rounded-lg border border-stone-300 dark:border-stone-800 bg-white dark:bg-stone-900/40">
        <div className="grid grid-cols-3 gap-4 px-6 py-4">
          <dt className="text-sm font-medium text-stone-500 dark:text-stone-400">
            Име
          </dt>
          <dd className="col-span-2 text-stone-900 dark:text-stone-100">
            {displayName}
          </dd>
        </div>
        <div className="grid grid-cols-3 gap-4 px-6 py-4">
          <dt className="text-sm font-medium text-stone-500 dark:text-stone-400">
            Имейл
          </dt>
          <dd className="col-span-2 text-stone-900 dark:text-stone-100">
            {user.email}
          </dd>
        </div>
        <div className="grid grid-cols-3 gap-4 px-6 py-4">
          <dt className="text-sm font-medium text-stone-500 dark:text-stone-400">
            Регистрация
          </dt>
          <dd className="col-span-2 text-stone-900 dark:text-stone-100">
            {dateFormatter.format(new Date(createdAt))}
          </dd>
        </div>
      </dl>

      <AvatarPicker
        userId={user.id}
        displayName={displayName}
        initialAvatarId={avatarId}
        googleAvatarUrl={googleAvatarUrl}
      />

      <div className="mt-8 flex justify-end">
        <ProfileSignOutButton />
      </div>
    </main>
  );
}
