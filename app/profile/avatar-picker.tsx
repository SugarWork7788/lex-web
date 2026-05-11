"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { DEFAULT_AVATAR_ID, GOOGLE_AVATAR_ID } from "@/lib/avatars";
import { InitialsAvatar } from "../_components/initials-avatar";
import { saveAvatar } from "./save-avatar";

// Two options today:
//   - 'initials' (default) — colored circle with first letter of display_name
//   - 'google' (optional)  — Google profile photo, only if signed in via OAuth
//
// The preset PNG grid was removed (commit history: image/name mismatch).
// Future: re-introduce a curated registry once URL→figure mapping is verified.

export function AvatarPicker({
  userId,
  displayName,
  initialAvatarId,
  googleAvatarUrl,
}: {
  userId: string;
  displayName: string | null;
  initialAvatarId: string;
  googleAvatarUrl: string | null;
}) {
  const [selected, setSelected] = useState<string>(initialAvatarId);
  const [savedId, setSavedId] = useState<string>(initialAvatarId);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isDirty = selected !== savedId;

  function handleSave() {
    setError(null);
    const next = selected;
    startTransition(async () => {
      const res = await saveAvatar(next);
      if (res.ok) {
        setSavedId(next);
      } else {
        setError(res.error ?? "Възникна грешка");
      }
    });
  }

  return (
    <section aria-labelledby="avatar-heading" className="mt-10">
      <h2
        id="avatar-heading"
        className="font-serif text-2xl font-bold text-stone-900 dark:text-stone-100"
      >
        Аватар
      </h2>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
        {googleAvatarUrl
          ? "Изберете между инициали (по подразбиране) или вашата Google профилна снимка."
          : "Цветен кръг с първата буква от вашето име. Постоянен цвят за вашия акаунт."}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:max-w-md">
        <Tile
          id={DEFAULT_AVATAR_ID}
          label="Инициали"
          selected={selected === DEFAULT_AVATAR_ID}
          onSelect={setSelected}
        >
          <InitialsAvatar userId={userId} displayName={displayName} size={80} />
        </Tile>

        {googleAvatarUrl && (
          <Tile
            id={GOOGLE_AVATAR_ID}
            label="Google профил"
            selected={selected === GOOGLE_AVATAR_ID}
            onSelect={setSelected}
          >
            <span className="relative h-20 w-20 overflow-hidden rounded-full ring-1 ring-stone-300 dark:ring-stone-700">
              <Image
                src={googleAvatarUrl}
                alt=""
                fill
                sizes="80px"
                unoptimized
                className="object-cover"
              />
            </span>
          </Tile>
        )}
      </div>

      <div className="mt-6 flex items-center justify-end gap-3">
        {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || pending}
          className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-stone-400 dark:bg-red-600 dark:hover:bg-red-500"
        >
          {pending ? "Запазване…" : "Запази аватар"}
        </button>
      </div>
    </section>
  );
}

function Tile({
  id,
  label,
  selected,
  onSelect,
  children,
}: {
  id: string;
  label: string;
  selected: boolean;
  onSelect: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      aria-pressed={selected}
      className={`group flex flex-col items-center rounded-lg border-2 p-4 transition-all ${
        selected
          ? "border-red-700 bg-red-50 dark:border-red-400 dark:bg-red-950/40"
          : "border-stone-200 bg-white hover:border-stone-400 dark:border-stone-800 dark:bg-stone-900/40 dark:hover:border-stone-600"
      }`}
    >
      {children}
      <span className="mt-3 text-sm text-stone-700 dark:text-stone-300">
        {label}
      </span>
    </button>
  );
}
