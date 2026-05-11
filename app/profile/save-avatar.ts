"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase, getSession } from "@/lib/supabase-auth";
import { GOOGLE_AVATAR_ID, PRESET_AVATARS } from "@/lib/avatars";

const VALID_IDS = new Set<string>([
  ...PRESET_AVATARS.map((a) => a.id),
  GOOGLE_AVATAR_ID,
]);

export async function saveAvatar(avatarId: string): Promise<{ ok: boolean; error?: string }> {
  if (!VALID_IDS.has(avatarId)) {
    return { ok: false, error: "Невалиден аватар" };
  }

  const user = await getSession();
  if (!user) return { ok: false, error: "Не сте влезли" };

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("user_profiles")
    .update({ avatar_id: avatarId })
    .eq("id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/profile");
  revalidatePath("/", "layout");
  return { ok: true };
}
