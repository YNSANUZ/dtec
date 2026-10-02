"use client";

import Image from "next/image";
import { UserRound } from "lucide-react";

export type PeoplePreview = { count: number; photos: Array<{ photoUrl: string | null }> };

export function MuralPeopleStack({ title, count, photos, onClick }: PeoplePreview & { title: string; onClick: () => void }) {
  if (count === 0) return null;
  const visible = photos.slice(0, 6);
  return (
    <button type="button" className="mural-people-trigger" onClick={onClick}
      aria-label={`Ver ${count} ${count === 1 ? "pessoa" : "pessoas"} em ${title}`}>
      <span className="mural-people-stack" aria-hidden="true">
        {visible.map(({ photoUrl }, index) => <span className="mural-people-photo" key={index}>
          {photoUrl
            ? <Image src={photoUrl} alt="" width={32} height={32} unoptimized referrerPolicy="no-referrer" />
            : <UserRound className="mural-people-placeholder" size={18} />}
        </span>)}
        {count > visible.length && <span className="mural-people-remainder">+{count - visible.length}</span>}
      </span>
    </button>
  );
}
