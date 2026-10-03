export type CuboRole = "owner" | "leader" | "member" | "visitor";
export const roleIdentity: Record<CuboRole, string> = {
  owner: "👑 ADM", leader: "🛡️ MOD", member: "👤 MEMBRO", visitor: "👋 VISITANTE",
};
type Permission = { id: string; label: string; roles: readonly CuboRole[] };
const everyone: CuboRole[] = ["owner", "leader", "member", "visitor"];
const members: CuboRole[] = ["owner", "leader", "member"];
const staff: CuboRole[] = ["owner", "leader"];
const owner: CuboRole[] = ["owner"];
// These are role ceilings, not a substitute for membership, authorship,
// visibility, target hierarchy or database checks.
export const roomPermissions = [
  { id: "walk", label: "Caminhar na sala", roles: everyone },
  { id: "createContent", label: "Criar evento ou vaquinha", roles: members },
  { id: "createPanel", label: "Criar e organizar painéis", roles: staff },
  { id: "movePanel", label: "Renomear e mover painéis", roles: staff },
  { id: "removePanel", label: "Excluir painéis", roles: owner },
  { id: "readPublic", label: "Visualizar painéis da sala", roles: members },
  { id: "createNote", label: "Criar notas próprias", roles: members },
  { id: "editOwnNote", label: "Editar notas próprias", roles: members },
  { id: "removeOwnNote", label: "Excluir notas próprias", roles: members },
  { id: "createInformation", label: "Criar informações próprias", roles: members },
  { id: "editOwnInformation", label: "Editar informações próprias", roles: members },
  { id: "removeOwnInformation", label: "Excluir informações próprias", roles: members },
  { id: "editOthers", label: "Editar conteúdo compartilhado de terceiros", roles: staff },
  { id: "removeOthers", label: "Excluir conteúdo compartilhado de terceiros", roles: staff },
  { id: "removeOwnContent", label: "Apagar evento ou vaquinha própria", roles: members },
  { id: "chat", label: "Conversar no chat", roles: members },
  { id: "pin", label: "Fixar conteúdos em destaque", roles: staff },
  { id: "mute", label: "Silenciar usuários", roles: staff },
  { id: "kick", label: "Expulsar membros", roles: staff },
  { id: "ban", label: "Banir membros", roles: staff },
  { id: "moderationHistory", label: "Visualizar histórico de moderação", roles: staff },
  { id: "appoint", label: "Promover ou rebaixar membros", roles: owner },
  { id: "permissions", label: "Gerenciar permissões de acesso", roles: owner },
  { id: "settings", label: "Configurar entrada da sala", roles: staff },
  { id: "deleteRoom", label: "Apagar sala (proprietário e confirmação)", roles: owner },
] as const satisfies readonly Permission[];
export type RoomPermission = typeof roomPermissions[number]["id"];
export function hasPermission(role: CuboRole | null | undefined, action: RoomPermission): boolean {
  const rule = roomPermissions.find(item => item.id === action);
  return Boolean(role && rule && (rule.roles as readonly CuboRole[]).includes(role));
}
export function canModerateMember(actor: CuboRole, target: CuboRole): boolean {
  return (actor === "owner" || actor === "leader") && target === "member";
}
export function canReadNote(actorId: string | null, authorId: string, visibility: "private" | "team" | "public", member: boolean, panelAllowed: boolean): boolean {
  if (!panelAllowed || !member) return false;
  return visibility === "private" ? actorId === authorId : visibility === "team" ? member : true;
}
