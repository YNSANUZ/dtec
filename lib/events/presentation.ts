export type EventCardInput = {
  id: string;
  title: string;
  description: string;
  category: string;
  startsAt: string | null;
  location: string;
  interestCount: number;
};

export function toEventCardViewModel(event: EventCardInput, locale = "pt-BR") {
  const parsedDate = event.startsAt ? new Date(event.startsAt) : null;
  const whenLabel = parsedDate && !Number.isNaN(parsedDate.getTime())
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(parsedDate)
    : "Data a combinar";
  const count = Math.max(0, Math.floor(event.interestCount));
  return {
    ...event,
    whenLabel,
    whereLabel: event.location.trim() || "Local a combinar",
    interestLabel: `${count} ${count === 1 ? "interessado" : "interessados"}`,
  };
}

export function eventLocalDateTime(timestamp: string | null) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
