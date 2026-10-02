export function normalizeRoomSlug(input: string): string {
  const slug = input.toLowerCase();
  if (!/^[a-z0-9]{3,20}$/.test(slug)) {
    throw new Error("O ID da sala deve ter de 3 a 20 letras ou números, sem espaços, acentos ou pontos.");
  }
  if (["api", "auth", "www"].includes(slug)) {
    throw new Error("Este ID de sala é reservado. Escolha outro.");
  }
  return slug;
}
