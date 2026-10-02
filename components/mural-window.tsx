"use client";

import { useState } from "react";
import {
  ArrowLeft,
  CakeSlice,
  ChevronRight,
  ClipboardList,
  FolderOpen,
  Megaphone,
  PartyPopper,
  UsersRound,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { MuralId } from "@/lib/mural-types";

type FolderInfo = {
  title: string;
  summary: string;
  emptyMessage: string;
};

type MuralInfo = {
  title: string;
  description: string;
  Icon: typeof Megaphone;
  folders: FolderInfo[];
};

const muralInfo: Record<MuralId, MuralInfo> = {
  information: {
    title: "Mural de Informações",
    description: "Recados, avisos e informações compartilhadas do ambiente.",
    Icon: Megaphone,
    folders: [
      { title: "Comunicados", summary: "Avisos gerais para o grupo.", emptyMessage: "Ainda não há comunicados publicados." },
      { title: "Recados", summary: "Mensagens e informações da equipe.", emptyMessage: "Ainda não há recados publicados." },
      { title: "Lembretes", summary: "Datas e assuntos para acompanhar.", emptyMessage: "Ainda não há lembretes cadastrados." },
      { title: "Vaquinhas", summary: "Contribuições e iniciativas coletivas.", emptyMessage: "Ainda não há vaquinhas cadastradas." },
    ],
  },
  demands: {
    title: "Demandas",
    description: "Atividades e solicitações que o grupo precisa organizar.",
    Icon: ClipboardList,
    folders: [
      { title: "Equipamentos", summary: "Verificações e necessidades de equipamentos.", emptyMessage: "Ainda não há demandas de equipamentos." },
      { title: "Solicitações", summary: "Pedidos e assuntos para acompanhar.", emptyMessage: "Ainda não há solicitações cadastradas." },
      { title: "Atividades da equipe", summary: "Tarefas e atividades em grupo.", emptyMessage: "Ainda não há atividades cadastradas." },
    ],
  },
  leisure: {
    title: "Lazer",
    description: "Atividades sociais e interesses da equipe.",
    Icon: PartyPopper,
    folders: [
      { title: "Futebol", summary: "Interesse permanente na atividade.", emptyMessage: "Ainda não há eventos cadastrados. Demonstrar interesse não significa confirmar presença em um evento." },
      { title: "Paintball", summary: "Informações e atividades de paintball.", emptyMessage: "Ainda não há eventos cadastrados. Demonstrar interesse não significa confirmar presença em um evento." },
      { title: "Kart", summary: "Sugestões e atividades de kart.", emptyMessage: "Ainda não há eventos cadastrados. Demonstrar interesse não significa confirmar presença em um evento." },
      { title: "Confraternizações", summary: "Encontros e atividades sociais.", emptyMessage: "Ainda não há eventos cadastrados." },
    ],
  },
  birthdays: {
    title: "Aniversariantes",
    description: "Aniversários dos participantes deste ambiente.",
    Icon: CakeSlice,
    folders: [
      { title: "Aniversariantes do mês", summary: "Nomes e dias de aniversário.", emptyMessage: "A lista será exibida quando os aniversários reais forem cadastrados. Nenhuma data fictícia é usada nesta demonstração." },
      { title: "Próximos aniversários", summary: "Quem faz aniversário a seguir.", emptyMessage: "O próximo aniversário será calculado após o cadastro das datas reais." },
    ],
  },
};

export default function MuralWindow({
  muralId,
  onClose,
}: {
  muralId: MuralId;
  onClose: () => void;
}) {
  const [folderIndex, setFolderIndex] = useState<number | null>(null);
  const mural = muralInfo[muralId];
  const folder = folderIndex === null ? null : mural.folders[folderIndex];
  const Icon = mural.Icon;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="mural-dialog" overlayClassName="mural-overlay">
        <div className="mural-titlebar">
          <span className="mural-title-icon"><Icon aria-hidden="true" /></span>
          <DialogHeader className="mural-heading">
            <DialogTitle>{folder?.title ?? mural.title}</DialogTitle>
            <DialogDescription>{folder?.summary ?? mural.description}</DialogDescription>
          </DialogHeader>
          {folder && (
            <button className="mural-back" onClick={() => setFolderIndex(null)} type="button">
              <ArrowLeft size={16} /> Voltar
            </button>
          )}
        </div>

        {folder ? (
          <section className="mural-folder-content">
            <div className="mural-empty-icon"><FolderOpen aria-hidden="true" /></div>
            <h3>{folder.title}</h3>
            <p>{folder.emptyMessage}</p>
            <span className="mural-demo-label">Área pronta para receber conteúdo</span>
          </section>
        ) : (
          <div className="mural-folder-list" aria-label={`Pastas de ${mural.title}`}>
            {mural.folders.map((item, index) => (
              <button
                className="mural-folder"
                key={item.title}
                onClick={() => setFolderIndex(index)}
                type="button"
              >
                <span className="mural-folder-icon"><FolderOpen aria-hidden="true" /></span>
                <span className="mural-folder-copy">
                  <strong>{item.title}</strong>
                  <small>{item.summary}</small>
                </span>
                <span className="mural-folder-count" aria-label="Sem itens cadastrados">
                  <ChevronRight size={16} />
                </span>
              </button>
            ))}
          </div>
        )}

        <footer className="mural-statusbar">
          <UsersRound size={14} aria-hidden="true" />
          <span>Conteúdo demonstrativo — recursos de cadastro serão conectados na etapa de dados.</span>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
