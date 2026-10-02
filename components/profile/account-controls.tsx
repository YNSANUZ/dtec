"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { DropdownMenu } from "radix-ui";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { ProfileForm } from "./profile-form";
import type { useDtecAuth } from "@/hooks/use-dtec-auth";
import { googleIdentity } from "@/lib/profile/google-identity";
import styles from "./profile.module.css";

export function AccountControls({ auth, loginNext, onEditProfile, onCreateRoom }: {
  auth: ReturnType<typeof useDtecAuth>; loginNext: string; onEditProfile?: () => void; onCreateRoom?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [failedPhoto, setFailedPhoto] = useState("");
  const identity = googleIdentity(auth.user);
  const firstName = (auth.profile?.displayName || identity.name).trim().split(/\s+/)[0] || "Perfil";
  const photo = identity.photo && failedPhoto !== identity.photo ? identity.photo : "";
  const edit = () => { if (onEditProfile) onEditProfile(); else setEditing(true); };
  if (auth.state === "loading") return null;
  if (auth.state === "anonymous") return <Link className={styles.account} aria-label="Entrar com Google" href={`/auth/login?next=${loginNext}`}><span className={styles.photo}><Image src="https://img.icons8.com/color/1200/google-logo.jpg" alt="" width={36} height={36} unoptimized referrerPolicy="no-referrer" /></span><span>Entrar</span></Link>;
  return <>
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={styles.account} aria-label={`Perfil de ${firstName}`}><span className={styles.photo}>{photo ? <Image src={photo} alt="" width={36} height={36} unoptimized referrerPolicy="no-referrer" onError={() => setFailedPhoto(identity.photo)} /> : <span aria-hidden="true">{firstName[0].toUpperCase()}</span>}</span><span>{firstName}</span><span className={styles.chevron} aria-hidden="true">⌄</span></DropdownMenu.Trigger>
      <DropdownMenu.Portal><DropdownMenu.Content className={styles.menu} align="end" sideOffset={9}>
        <DropdownMenu.Label>{auth.profile?.displayName || identity.name}</DropdownMenu.Label>
        <DropdownMenu.Item onSelect={edit}>{auth.profile ? "Meu avatar e perfil" : "Completar perfil"}</DropdownMenu.Item>
        {onCreateRoom ? <DropdownMenu.Item onSelect={onCreateRoom}>Criar meu CuboChat</DropdownMenu.Item> : <DropdownMenu.Item asChild><Link href="/?create=1">Criar meu CuboChat</Link></DropdownMenu.Item>}
        <DropdownMenu.Item disabled>Instalar aplicativo <small>Em breve</small></DropdownMenu.Item>
        <DropdownMenu.Item onSelect={() => void auth.signOut()}>Sair da conta</DropdownMenu.Item>
      </DropdownMenu.Content></DropdownMenu.Portal>
    </DropdownMenu.Root>
    <Dialog open={editing} onOpenChange={setEditing}>
      <DialogContent className={styles.dialog} showCloseButton={false}>
        <header className={styles.dialogHeader}><div><DialogTitle>{auth.profile ? "Meu avatar e perfil" : "Crie seu personagem"}</DialogTitle><DialogDescription>A sala continua aberta ao fundo.</DialogDescription></div><DialogClose className={styles.close} aria-label="Fechar perfil">×</DialogClose></header>
        {editing && <ProfileForm key={auth.user?.id} profile={auth.profile} suggestedName={identity.suggestedName} onSave={async (draft) => { await auth.saveProfile(draft); setEditing(false); }} onCancel={() => setEditing(false)} />}
      </DialogContent>
    </Dialog>
  </>;
}
