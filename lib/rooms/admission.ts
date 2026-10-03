export const inviteLifetimes = {"10m":"10 minutos","1h":"1 hora","1d":"1 dia","1mo":"1 mês"} as const;
export type InviteLifetime=keyof typeof inviteLifetimes;
export type EntryMode="public"|"protected";
export function isGuestToken(value:unknown):value is string {return typeof value==="string"&&/^[a-z]{2}[0-9]{2}$/.test(value);}
export function admissionSettings(input:unknown){
  if(!input||typeof input!=="object"||Array.isArray(input))throw new Error("invalid_settings");
  const body=input as Record<string,unknown>;
  if(body.entryMode!=="public"&&body.entryMode!=="protected")throw new Error("invalid_mode");
  if(typeof body.inviteLifetime!=="string"||!Object.hasOwn(inviteLifetimes,body.inviteLifetime))throw new Error("invalid_lifetime");
  return {entryMode:body.entryMode as EntryMode,inviteLifetime:body.inviteLifetime as InviteLifetime};
}
