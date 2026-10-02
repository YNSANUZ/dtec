export type RoomRole = "owner" | "leader" | "member";

export function roleLabel(role: RoomRole): "ADM" | "MOD" | "" {
  if (role === "owner") return "ADM";
  if (role === "leader") return "MOD";
  return "";
}

export function canAppointModerator(role: RoomRole | null | undefined): boolean {
  return role === "owner";
}

export function normalizeRoomRole(role: unknown): RoomRole {
  return role === "owner" || role === "leader" ? role : "member";
}
