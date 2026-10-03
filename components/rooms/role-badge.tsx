import { roleBadges, type BadgeRole } from "@/lib/room/role-badge";

export function RoleBadge({role,small=false}:{role:BadgeRole;small?:boolean}) {
  const badge=roleBadges[role];
  return <svg className={`room-role-medal ${small?"room-role-medal-small":""}`} viewBox="0 0 100 118" role="img" aria-label={badge.label}>
    <title>{badge.label}</title>
    <path d="M50 4L94 27V86L50 112L6 86V27Z" fill={badge.color} stroke={badge.edge} strokeWidth="5"/>
    <path d="M50 12L86 31V82L50 103L14 82V31Z" fill="none" stroke={badge.edge} strokeWidth="1" opacity=".6"/>
    <text x="50" y="49" textAnchor="middle" fontSize="30">{badge.icon}</text>
    <text x="50" y="79" textAnchor="middle" fill="white" fontFamily="Arial,sans-serif" fontWeight="900" fontSize={small||role==="owner"||role==="leader"?20:14}>{badge.label}</text>
  </svg>;
}
