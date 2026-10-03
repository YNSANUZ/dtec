export type MemberSince = {joinedAt?: string|null;joinDateQuality?:"recorded"|"legacy_unknown"};
export function memberSinceLabel(value:MemberSince):string|null{
  if(value.joinDateQuality==="legacy_unknown")return "Membro desde: data original não registrada";
  if(value.joinDateQuality!=="recorded"||!value.joinedAt||!Number.isFinite(Date.parse(value.joinedAt)))return null;
  return `Membro desde ${new Intl.DateTimeFormat("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",timeZone:"America/Sao_Paulo"}).format(new Date(value.joinedAt))}`;
}
