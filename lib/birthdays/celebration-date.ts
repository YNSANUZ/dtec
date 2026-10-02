const birthdayPattern = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function isBirthdayToday(monthDay: string | null, now: Date): boolean {
  if (!monthDay || !Number.isFinite(now.getTime())) return false;
  const match = birthdayPattern.exec(monthDay);
  if (!match) return false;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const sample = new Date(Date.UTC(2000, month - 1, day));
  if (sample.getUTCMonth() !== month - 1 || sample.getUTCDate() !== day) return false;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const todayMonth = parts.find((part) => part.type === "month")?.value;
  const todayDay = parts.find((part) => part.type === "day")?.value;
  return todayMonth === match[1] && todayDay === match[2];
}
