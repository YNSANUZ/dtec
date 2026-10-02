import type { RoomRole } from "@/lib/room/roles";

export type RoomPerson = { userId: string; name: string; avatar: string; title: string; role: RoomRole };
export type RoomPersonProfile = RoomPerson & { bio: string; birthDayMonth: string | null; whatsapp: string; instagram: string };
export type PublicRoomPerson = { userId: string; name: string; avatar: string; online: boolean };
