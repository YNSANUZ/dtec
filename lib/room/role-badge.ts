import type { RoomRole } from "./roles";

export type BadgeRole = RoomRole | "visitor";
export const roleBadges = {
  owner: { label: "ADM", icon: "👑", color: "#103d79", edge: "#f3bd39" },
  leader: { label: "MOD", icon: "🛡", color: "#14676e", edge: "#8de0d0" },
  member: { label: "Membro", icon: "👤", color: "#385173", edge: "#b6c9e6" },
  visitor: { label: "Visitante", icon: "👋", color: "#5b6471", edge: "#d3dae3" },
} as const;

// Private label canvas, never a shared avatar material/texture.
export function drawRoleBadge(ctx: CanvasRenderingContext2D, role: BadgeRole, x: number, y: number, size: number) {
  const badge = roleBadges[role];
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 100, size / 100);
  ctx.beginPath();
  ctx.moveTo(50, 0); ctx.lineTo(94, 23); ctx.lineTo(94, 82);
  ctx.lineTo(50, 108); ctx.lineTo(6, 82); ctx.lineTo(6, 23); ctx.closePath();
  ctx.fillStyle = badge.color; ctx.fill();
  ctx.strokeStyle = badge.edge; ctx.lineWidth = 6; ctx.stroke();
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "34px Arial"; ctx.fillText(badge.icon, 50, 35);
  ctx.fillStyle = "white"; ctx.font = `900 ${role === "owner" || role === "leader" ? 25 : 16}px Arial`;
  ctx.fillText(badge.label, 50, 73, 80);
  ctx.restore();
}
