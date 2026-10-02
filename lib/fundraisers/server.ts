import { getMuralUserContext } from "@/lib/mural-server";
import { hasRoomRole } from "@/lib/rooms/authorization";

export type MuralUser = NonNullable<Awaited<ReturnType<typeof getMuralUserContext>>>;

export async function hasFundraiserManagerRole(user: MuralUser) {
  return hasRoomRole(user, "dtec", ["owner", "leader"]);
}
