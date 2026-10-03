import {memberSinceLabel,type MemberSince as MemberSinceData} from "@/lib/rooms/member-since";
export function MemberSince({value}:{value:MemberSinceData}){
  const label=memberSinceLabel(value);
  return label?<small className="member-since">{label}</small>:null;
}
