const timeZone = "America/Sao_Paulo";

function saoPauloDateParts(value: Date) {
  if (Number.isNaN(value.getTime())) throw new RangeError("Informe uma data válida.");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.get("year")),
    month: Number(values.get("month")),
    day: Number(values.get("day")),
  };
}

function dueDate(year: number, month: number, dueDay: number) {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${Math.min(dueDay, daysInMonth).toString().padStart(2, "0")}`;
}

export function getUpcomingDueDate(now: Date, dueDay: number): string {
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
    throw new RangeError("O vencimento deve ser um dia entre 1 e 31.");
  }
  const { year, month, day } = saoPauloDateParts(now);
  const currentMonthDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dueDateThisMonth = Math.min(dueDay, currentMonthDays);
  const isDueDateReached = day >= dueDateThisMonth;
  const nextMonth = new Date(Date.UTC(year, month - 1 + (isDueDateReached ? 1 : 0), 1));
  return dueDate(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth() + 1, dueDay);
}
