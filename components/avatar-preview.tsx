"use client";

import React, { useState } from "react";
import { avatarThumbnailUrl } from "@/lib/avatar-thumbnail";

export default function AvatarPreview({ model, headOnly = false }: { model: string; headOnly?: boolean }) {
  const src = avatarThumbnailUrl(model, headOnly);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return <div className={headOnly ? "avatar-preview avatar-head-only" : "avatar-preview"} aria-hidden="true">
    {failedSrc !== src
      // Pre-rendered local raster: no GLTF, WebGL context or RAF in the roster.
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={src} alt="" width={176} height={176} draggable={false} onError={() => setFailedSrc(src)} />
      : <span className="avatar-thumbnail-placeholder">●</span>}
  </div>;
}
