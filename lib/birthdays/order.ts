export type BirthdayEntry = { userId: string; name: string; avatar: string; title: string; birthDayMonth: string };

function cycleDay(monthDay: string) {
  const [month, day] = monthDay.split("-").map(Number);
  return Date.UTC(2000, month - 1, day) / 86_400_000;
}

export function orderBirthdays<T extends BirthdayEntry>(entries: T[], today: string) {
  const todayDay = cycleDay(today);
  return [...entries].sort((left, right) => {
    const leftDay = cycleDay(left.birthDayMonth);
    const rightDay = cycleDay(right.birthDayMonth);
    const leftDistance = (leftDay - todayDay + 366) % 366;
    const rightDistance = (rightDay - todayDay + 366) % 366;
    return leftDistance - rightDistance || left.name.localeCompare(right.name, "pt-BR");
  });
}

export function saoPauloMonthDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${month}-${day}`;
}

export function formatBirthday(monthDay: string) {
  const [month, day] = monthDay.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", timeZone: "UTC" })
    .format(new Date(Date.UTC(2000, month - 1, day)));
}
