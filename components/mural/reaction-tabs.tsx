"use client";

import type { MuralReaction } from "@/lib/mural-reactions";

export function MuralReactionTabs({ selected, onSelect }: { selected: MuralReaction; onSelect: (reaction: MuralReaction) => void }) {
  return <div className="mural-reaction-tabs" aria-label="Filtrar reações">
    <button type="button" aria-pressed={selected === "like"} onClick={() => onSelect("like")}>Curtiram</button>
    <button type="button" aria-pressed={selected === "dislike"} onClick={() => onSelect("dislike")}>Descurtiram</button>
  </div>;
}
