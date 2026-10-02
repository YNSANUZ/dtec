import { z } from "zod";

const fundraiserInput = z.object({
  title: z.string().trim().min(1, "Informe o nome da vaquinha.").max(100, "O título deve ter até 100 caracteres."),
  description: z.string().trim().max(1500, "A descrição deve ter até 1500 caracteres.").default(""),
  monthlyAmountCents: z.number().int("Use um valor inteiro em centavos.").positive("O valor por pessoa deve ser maior que zero.").max(Number.MAX_SAFE_INTEGER),
  dueDay: z.number().int("Informe o dia de vencimento.").min(1, "O dia deve estar entre 1 e 31.").max(31, "O dia deve estar entre 1 e 31."),
  pixKey: z.string().trim().max(200, "A chave Pix deve ter até 200 caracteres.").nullable().optional().transform((value) => value || null),
  paymentInstructions: z.string().trim().max(1000, "As instruções devem ter até 1000 caracteres.").default(""),
}).strip();

const fundraiserPatchInput = fundraiserInput.extend({
  status: z.enum(["open", "closed", "cancelled"]).optional(),
}).partial().refine((value) => Object.keys(value).length > 0, "Informe ao menos um campo para atualizar.");

export type NormalizedFundraiser = {
  title: string;
  description: string;
  monthlyAmountCents: number;
  dueDay: number;
  pixKey: string | null;
  paymentInstructions: string;
};

export function normalizeFundraiser(input: unknown): NormalizedFundraiser {
  const result = fundraiserInput.safeParse(input);
  if (!result.success) {
    const field = result.error.issues[0]?.path[0];
    if (field === "monthlyAmountCents") throw new Error("Informe um valor mensal fixo por pessoa, em centavos e maior que zero.");
    if (field === "dueDay") throw new Error("Informe um dia de vencimento entre 1 e 31.");
    if (field === "pixKey") throw new Error("A chave Pix deve ter até 200 caracteres.");
    if (field === "paymentInstructions") throw new Error("As instruções devem ter até 1000 caracteres.");
    throw new Error(result.error.issues[0]?.message ?? "Informe os dados da vaquinha.");
  }
  return result.data;
}

export type NormalizedFundraiserPatch = Partial<NormalizedFundraiser> & {
  status?: "open" | "closed" | "cancelled";
};

export function normalizeFundraiserPatch(input: unknown): NormalizedFundraiserPatch {
  const result = fundraiserPatchInput.safeParse(input);
  if (!result.success) {
    const field = result.error.issues[0]?.path[0];
    if (field === "monthlyAmountCents") throw new Error("Informe um valor mensal fixo por pessoa, em centavos e maior que zero.");
    if (field === "dueDay") throw new Error("Informe um dia de vencimento entre 1 e 31.");
    if (field === "pixKey") throw new Error("A chave Pix deve ter até 200 caracteres.");
    if (field === "paymentInstructions") throw new Error("As instruções devem ter até 1000 caracteres.");
    throw new Error(result.error.issues[0]?.message ?? "Informe uma atualização válida.");
  }
  return result.data;
}
