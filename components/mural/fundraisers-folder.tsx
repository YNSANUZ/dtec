"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Clipboard, CreditCard, Plus, Settings, UsersRound } from "lucide-react";
import AvatarPreview from "@/components/avatar-preview";
import { canChangeFundraiserPayment, toFundraiserCardViewModel, type ContributionPerson } from "@/lib/fundraisers/presentation";

type Fundraiser = {
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
type DirectoryUser = { userId: string; name: string; avatar: string; title?: string };
type ResponseBody = { fundraisers?: Fundraiser[]; error?: string };

type CampaignForm = { title: string; description: string; monthlyAmount: string; dueDay: string; pixKey: string; paymentInstructions: string; status: "open" | "closed" | "cancelled" };
const emptyForm: CampaignForm = { title: "", description: "", monthlyAmount: "", dueDay: "10", pixKey: "", paymentInstructions: "", status: "open" };

async function parseResponse<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error && !body.error.includes("failed") ? body.error : "Não foi possível concluir a operação.");
  return body;
}

function CampaignEditor({
  initial,
  saving,
  onCancel,
  onSave,
}: {
  initial: CampaignForm;
  saving: boolean;
  onCancel: () => void;
  onSave: (form: CampaignForm) => void;
}) {
  const [form, setForm] = useState(initial);
  const set = (key: keyof CampaignForm, value: string) => setForm((current) => ({ ...current, [key]: value }));
  return <form className="fundraiser-editor" onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
    <label>Nome<input required maxLength={100} value={form.title} onChange={(event) => set("title", event.target.value)} placeholder="Ex.: Aniversários do mês" /></label>
    <label>Descrição<textarea maxLength={1500} rows={2} value={form.description} onChange={(event) => set("description", event.target.value)} placeholder="Para que será usada a contribuição?" /></label>
    <div className="fundraiser-form-row"><label>Valor fixo por pessoa (R$)<input required type="number" min="0.01" step="0.01" value={form.monthlyAmount} onChange={(event) => set("monthlyAmount", event.target.value)} placeholder="25,00" /></label><label>Dia de vencimento<input required type="number" min="1" max="31" step="1" value={form.dueDay} onChange={(event) => set("dueDay", event.target.value)} /></label></div>
    <label>Chave Pix <span className="optional-label">opcional</span><input maxLength={200} value={form.pixKey} onChange={(event) => set("pixKey", event.target.value)} autoComplete="off" /></label>
    <label>Instruções de pagamento <span className="optional-label">opcional</span><textarea maxLength={1000} rows={2} value={form.paymentInstructions} onChange={(event) => set("paymentInstructions", event.target.value)} /></label>
    {initial.title && <label>Situação<select value={form.status} onChange={(event) => set("status", event.target.value)}><option value="open">Aberta</option><option value="closed">Encerrada</option><option value="cancelled">Cancelada</option></select></label>}
    <div className="fundraiser-form-actions"><button type="button" className="mural-secondary-button" onClick={onCancel}>Cancelar</button><button type="submit" className="mural-primary-button" disabled={saving}>{saving ? "Salvando…" : initial.title ? "Salvar alterações" : "Criar vaquinha"}</button></div>
  </form>;
}

export function FundraisersFolder({ currentUserId, isAdminOrMod, roomSlug }: { currentUserId: string | null; isAdminOrMod: boolean; roomSlug?: string }) {
  const api = roomSlug ? `/api/rooms/${roomSlug}/fundraisers` : "/api/fundraisers";
  const directoryApi = roomSlug ? `/api/rooms/${roomSlug}/presence` : "/api/room/characters";
  const [fundraisers, setFundraisers] = useState<Fundraiser[]>([]);
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formCampaign, setFormCampaign] = useState<Fundraiser | null | undefined>(undefined);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const load = async () => {
    const body = await parseResponse<ResponseBody>(await fetch(api, { cache: "no-store" }));
    setFundraisers(body.fundraisers ?? []);
  };

  useEffect(() => {
    if (!currentUserId) { window.setTimeout(() => setLoading(false), 0); return; }
    let active = true;
    fetch(api, { cache: "no-store" })
      .then(async (response) => parseResponse<ResponseBody>(response))
      .then((body) => { if (active) setFundraisers(body.fundraisers ?? []); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Falha ao carregar as vaquinhas."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [currentUserId, api]);

  useEffect(() => {
    if (!currentUserId || !isAdminOrMod) return;
    let active = true;
    fetch(directoryApi, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as { users?: DirectoryUser[] };
        if (response.ok && active) setDirectory(body.users ?? []);
      })
      .catch(() => { if (active) setDirectory([]); });
    return () => { active = false; };
  }, [currentUserId, isAdminOrMod, directoryApi]);

  const selected = fundraisers.find((campaign) => campaign.id === selectedId) ?? null;
  const view = selected ? toFundraiserCardViewModel(selected) : null;
  const enrolledIds = useMemo(() => new Set([...(selected?.paid ?? []), ...(selected?.pending ?? [])].map((person) => person.userId)), [selected]);
  const availableMembers = directory.filter((person) => !enrolledIds.has(person.userId));

  const changeParticipant = async (method: "POST" | "DELETE", userId?: string) => {
    if (!selected) return;
    setSaving(true); setError("");
    try {
      await parseResponse(await fetch(`${api}/${selected.id}/participants`, {
        method,
        headers: userId ? { "Content-Type": "application/json" } : undefined,
        body: userId ? JSON.stringify({ userId }) : undefined,
      }));
      await load();
      if (userId) setSelectedMemberId("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível atualizar a participação."); }
    finally { setSaving(false); }
  };

  const setPayment = async (person: ContributionPerson, paid: boolean) => {
    if (!selected || !currentUserId || !canChangeFundraiserPayment(currentUserId, isAdminOrMod, person.userId)) return;
    setSaving(true); setError("");
    try {
      await parseResponse(await fetch(`${api}/${selected.id}/contributions/${person.userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paid, cycleDueDate: selected.currentCycleDueDate }),
      }));
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível atualizar o pagamento."); }
    finally { setSaving(false); }
  };

  const saveCampaign = async (form: CampaignForm) => {
    const amount = Number(form.monthlyAmount.replace(",", "."));
    const amountCents = Math.round(amount * 100);
    if (!Number.isFinite(amount) || !Number.isSafeInteger(amountCents) || amountCents <= 0) { setError("Informe um valor mensal válido em reais."); return; }
    const payload = {
      title: form.title,
      description: form.description,
      monthlyAmountCents: amountCents,
      dueDay: Number(form.dueDay),
      pixKey: form.pixKey || null,
      paymentInstructions: form.paymentInstructions,
      ...(formCampaign ? { status: form.status } : {}),
    };
    setSaving(true); setError("");
    try {
      const response = await fetch(formCampaign ? `${api}/${formCampaign.id}` : api, {
        method: formCampaign ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await parseResponse<{ fundraiser?: { id: string } }>(response);
      await load();
      if (!formCampaign && body.fundraiser?.id) setSelectedId(body.fundraiser.id);
      setFormCampaign(undefined);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar a vaquinha."); }
    finally { setSaving(false); }
  };

  const copyPix = async () => {
    if (!view?.pixKey) return;
    try { await navigator.clipboard.writeText(view.pixKey); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setError("Não foi possível copiar a chave Pix neste navegador."); }
  };

  const editorInitial: CampaignForm = formCampaign
    ? {
        title: formCampaign.title,
        description: formCampaign.description,
        monthlyAmount: (formCampaign.monthlyAmountCents / 100).toFixed(2),
        dueDay: String(formCampaign.dueDay),
        pixKey: formCampaign.pixKey ?? "",
        paymentInstructions: formCampaign.paymentInstructions,
        status: "open",
      }
    : emptyForm;

  return <section className="mural-folder-content fundraiser-folder" aria-live="polite">
    <div className="mural-breadcrumb"><span>Mural de Informações</span><span>›</span><strong>Vaquinhas</strong></div>
    {!currentUserId ? <div className="mural-access-note"><CreditCard aria-hidden="true" /><strong>Entre com o Google para consultar as vaquinhas.</strong><span>Valores e dados Pix só aparecem a pessoas autenticadas.</span></div>
      : loading ? <p className="mural-loading">Carregando vaquinhas…</p>
      : error && !fundraisers.length ? <p className="mural-form-error" role="alert">{error}</p>
      : formCampaign !== undefined ? <CampaignEditor initial={editorInitial} saving={saving} onCancel={() => setFormCampaign(undefined)} onSave={(form) => void saveCampaign(form)} />
      : selected && view ? <div className="fundraiser-detail">
        <div className="fundraiser-detail-heading"><button type="button" aria-label="Voltar às vaquinhas" onClick={() => setSelectedId(null)}><ArrowLeft size={16} /></button><div><h3>{view.title}</h3><span>{view.description || "Contribuição coletiva mensal."}</span></div>{isAdminOrMod && <button type="button" aria-label="Editar vaquinha" onClick={() => setFormCampaign(selected)}><Settings size={16} /></button>}</div>
        <div className="fundraiser-payment-info"><div><small>Valor fixo por pessoa / mês</small><strong>{view.monthlyAmountLabel}</strong></div><div><small>Vencimento</small><strong>{view.dueDayLabel}</strong><span>Ciclo atual: {view.currentCycleDueDateLabel}</span></div></div>
        {view.pixKey && <div className="fundraiser-pix"><div><small>Chave Pix</small><strong>{view.pixKey}</strong></div><button type="button" onClick={() => void copyPix()} aria-label="Copiar chave Pix">{copied ? <Check size={15} /> : <Clipboard size={15} />}{copied ? "Copiada" : "Copiar"}</button></div>}
        {view.paymentInstructions && <p className="fundraiser-instructions">{view.paymentInstructions}</p>}
        <div className="fundraiser-participation"><span>{view.isParticipant ? "Você participa desta vaquinha." : "Você ainda não participa."}</span><button type="button" disabled={saving} onClick={() => void changeParticipant(view.isParticipant ? "DELETE" : "POST")}>{view.isParticipant ? "Sair da vaquinha" : "Participar"}</button></div>
        {isAdminOrMod && availableMembers.length > 0 && <div className="fundraiser-add-member"><label htmlFor="fundraiser-member">Adicionar participante</label><div><select id="fundraiser-member" value={selectedMemberId} onChange={(event) => setSelectedMemberId(event.target.value)}><option value="">Escolha um membro…</option>{availableMembers.map((person) => <option key={person.userId} value={person.userId}>{person.name}{person.title ? ` — ${person.title}` : ""}</option>)}</select><button type="button" disabled={saving || !selectedMemberId} onClick={() => void changeParticipant("POST", selectedMemberId)}><Plus size={14} />Adicionar</button></div></div>}
        <div className="contribution-roster">
          <section className="contribution-paid"><h4>Pagaram <span>{view.paid.length}</span></h4>{view.paid.length ? view.paid.map((person) => <ContributionRow key={person.userId} person={person} paid saving={saving} canChange={canChangeFundraiserPayment(currentUserId, isAdminOrMod, person.userId)} onToggle={() => void setPayment(person, false)} onRemove={isAdminOrMod ? () => void changeParticipant("DELETE", person.userId) : undefined} />) : <p>Ninguém marcou pagamento neste ciclo ainda.</p>}</section>
          <section className="contribution-pending"><h4>Ainda não marcaram <span>{view.pending.length}</span></h4>{view.pending.length ? view.pending.map((person) => <ContributionRow key={person.userId} person={person} paid={false} saving={saving} canChange={canChangeFundraiserPayment(currentUserId, isAdminOrMod, person.userId)} onToggle={() => void setPayment(person, true)} onRemove={isAdminOrMod ? () => void changeParticipant("DELETE", person.userId) : undefined} />) : <p>Todas as pessoas participantes marcaram pagamento.</p>}</section>
        </div>
        <p className="fundraiser-payment-note">O registro de pagamento é manual; o app não processa nem confirma transferências Pix.</p>
      </div> : fundraisers.length === 0 ? <div className="mural-no-messages"><UsersRound size={22} /><strong>Ainda não há vaquinhas abertas</strong><span>Quando uma iniciativa for criada, ela aparecerá nesta pasta.</span>{isAdminOrMod && <button type="button" className="mural-primary-button" onClick={() => setFormCampaign(null)}>Criar vaquinha</button>}</div>
      : <div className="fundraiser-list"><div className="fundraiser-list-heading"><div><strong>Contribuições mensais</strong><small>Valor individual e situação de pagamento.</small></div>{isAdminOrMod && <button type="button" onClick={() => setFormCampaign(null)}><Plus size={14} />Criar vaquinha</button>}</div>{fundraisers.map((campaign) => { const card = toFundraiserCardViewModel(campaign); return <button type="button" className="fundraiser-card" key={campaign.id} onClick={() => setSelectedId(campaign.id)}><span className="fundraiser-card-icon"><CreditCard size={18} /></span><span><strong>{card.title}</strong><small>{card.monthlyAmountLabel} por pessoa · {card.dueDayLabel}</small></span><span className="fundraiser-card-status">{campaign.isParticipant ? "Participante" : "Aberta"}</span></button>; })}</div>}
    {error && fundraisers.length > 0 && <p className="mural-form-error" role="alert">{error}</p>}
  </section>;
}

function ContributionRow({ person, paid, saving, canChange, onToggle, onRemove }: { person: ContributionPerson; paid: boolean; saving: boolean; canChange: boolean; onToggle: () => void; onRemove?: () => void }) {
  return <article className={paid ? "contribution-person" : "contribution-person pending"}>
    <AvatarPreview model={person.avatar} headOnly />
    <span className="contribution-person-copy"><strong>{person.name}</strong>{person.title && <small>{person.title}</small>}{paid && person.markedAt && <time dateTime={person.markedAt}>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(person.markedAt))}</time>}</span>
    {canChange && <button type="button" disabled={saving} onClick={onToggle}>{paid ? "Marcar pendente" : "Marcar pago"}</button>}
    {onRemove && <button type="button" className="contribution-remove" disabled={saving} onClick={onRemove} aria-label={`Remover ${person.name} da vaquinha`}>×</button>}
  </article>;
}
