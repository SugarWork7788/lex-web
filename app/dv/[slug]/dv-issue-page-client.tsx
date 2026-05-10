"use client";

import { useState } from "react";
import { type DvActRow } from "@/lib/queries";
import { ActCard } from "./_components/act-card";
import { DvActSummary } from "./dv-act-summary";
import { DV_ACT_TYPE_ORDER, getActPill } from "../_lib/act-pill";

/**
 * Client-side state container for /dv/[slug]:
 *   - owns the "single-card-expanded-at-a-time" state per UI-SPEC §"Single-
 *     card-expanded constraint" (D-15)
 *   - groups acts by act_type and renders sections in the canonical order
 *     defined by DV_ACT_TYPE_ORDER (CONTEXT D-09)
 *   - empty state copy per UI-SPEC §"Interaction States"
 *
 * Per UI-SPEC §"Color → Accent must NOT": section H2s use text-stone-100, NOT
 * text-red-300 (the audit-page red H2 is reserved for the Audit corpus).
 *
 * Section heading shape: a small DV_ACT_PILL chip alongside the section name,
 * with the count next to it. Visual cue without using the H2 itself for color.
 */
export function DvIssuePageClient({ acts }: { acts: DvActRow[] }) {
  const [expandedActId, setExpandedActId] = useState<string | null>(null);

  // Group acts by act_type, falling back to "Other" for unmapped types.
  const grouped = new Map<string, DvActRow[]>();
  for (const a of acts) {
    const key =
      a.act_type && DV_ACT_TYPE_ORDER.includes(a.act_type)
        ? a.act_type
        : "Other";
    const arr = grouped.get(key) ?? [];
    arr.push(a);
    grouped.set(key, arr);
  }

  const sections = DV_ACT_TYPE_ORDER.map((t) => ({
    type: t,
    items: grouped.get(t) ?? [],
  })).filter((s) => s.items.length > 0);

  if (sections.length === 0) {
    return (
      <p className="mt-10 text-sm text-stone-400">Няма актове в този брой.</p>
    );
  }

  return (
    <div className="mt-8 space-y-10">
      {sections.map((section) => {
        const pill = getActPill(section.type);
        return (
          <section key={section.type}>
            <h2 className="font-serif text-lg font-semibold leading-snug text-stone-100 border-b border-stone-800 pb-2 flex items-center gap-2">
              <span className={pill.className}>{pill.label}</span>
              <span className="text-sm font-normal text-stone-400">
                ({section.items.length})
              </span>
            </h2>
            <ul className="mt-4 space-y-3">
              {section.items.map((act) => (
                <li key={act.id}>
                  <ActCard
                    act={act}
                    summary={
                      <DvActSummary
                        actId={act.id}
                        isExpanded={expandedActId === act.id}
                        onExpand={() => setExpandedActId(act.id)}
                        onCollapse={() => setExpandedActId(null)}
                      />
                    }
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
