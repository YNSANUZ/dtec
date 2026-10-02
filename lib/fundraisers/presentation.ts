export type ContributionPerson = {
  userId: string;
  name: string;
  avatar: string;
  title: string;
  markedAt: string | null;
};

export type FundraiserCardInput = {
  id: string;
  title: string;
  description: string;
  monthlyAmountCents: number;
  dueDay: number;
  pixKey: string | null;
  paymentInstructions: string;
  currentCycleDueDate: string;
  isParticipant: boolean;
  paid: ContributionPerson[];
  pending: ContributionPerson[];
};

export function formatMonthlyAmount(cents: number, locale = "pt-BR") {
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new RangeError("Valor mensal inválido.");
  return new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format(cents / 100);
}

export function formatCycleDueDate(value: string, locale = "pt-BR") {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (!year || !month || !day || date.toISOString().slice(0, 10) !== value) return "Data indisponível";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

export function toFundraiserCardViewModel(campaign: FundraiserCardInput) {
  return {
    ...campaign,
    monthlyAmountLabel: formatMonthlyAmount(campaign.monthlyAmountCents),
    dueDayLabel: `Vence todo dia ${campaign.dueDay}`,
    currentCycleDueDateLabel: formatCycleDueDate(campaign.currentCycleDueDate),
    paid: [...campaign.paid].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    pending: [...campaign.pending].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
  };
}

export function canChangeFundraiserPayment(currentUserId: string | null, isAdminOrMod: boolean, participantId: string) {
  return Boolean(currentUserId) && (isAdminOrMod || currentUserId === participantId);
}

export function fundraiserFolderState(input: { currentUserId: string | null; loading: boolean; error: string; count: number }) {
  if (!input.currentUserId) return "auth-required" as const;
  if (input.loading) return "loading" as const;
  if (input.error) return "error" as const;
  return input.count ? "ready" as const : "empty" as const;
}
