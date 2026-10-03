import {expect,it} from "vitest";
import {memberSinceLabel} from "@/lib/rooms/member-since";

it("formats the recorded original room entry discreetly in the room timezone",()=>{
  expect(memberSinceLabel({joinedAt:"2025-10-03T15:00:00Z",joinDateQuality:"recorded"})).toBe("Membro desde 03/10/2025");
  expect(memberSinceLabel({joinedAt:"2025-10-03T01:00:00Z",joinDateQuality:"recorded"})).toBe("Membro desde 02/10/2025");
});
it("never presents an import timestamp as original membership",()=>{
  expect(memberSinceLabel({joinedAt:"2026-10-03T15:00:00Z",joinDateQuality:"legacy_unknown"})).toBe("Membro desde: data original não registrada");
  for(const value of [{},{joinedAt:"invalid",joinDateQuality:"recorded" as const},{joinedAt:null,joinDateQuality:"recorded" as const}])expect(memberSinceLabel(value)).toBeNull();
});
