"use client";
import {useEffect,useRef,useState} from "react";
import {readHistoryPage,type HistoryEntry} from "@/lib/rooms/history";
export function RoomHistory(props:{roomSlug:string;kind:"entries"|"messages"}){
  return <ScopedRoomHistory key={`${props.roomSlug}:${props.kind}`} {...props}/>;
}
function ScopedRoomHistory({roomSlug,kind}:{roomSlug:string;kind:"entries"|"messages"}){
  const [open,setOpen]=useState(false),[rows,setRows]=useState<HistoryEntry[]>([]),[cursor,setCursor]=useState<string|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const scopeRef=useRef({active:false,writing:false});
  useEffect(()=>{const scope={active:true,writing:false};scopeRef.current=scope;return()=>{scope.active=false;};},[]);
  const load=async(next:string|null=null)=>{
    const scope=scopeRef.current;if(!scope.active||scope.writing)return;scope.writing=true;setBusy(true);setError("");
    try{
      const response=await fetch(`/api/rooms/${roomSlug}/settings/history?kind=${kind}${next?`&cursor=${encodeURIComponent(next)}`:""}`,{cache:"no-store"});
      if(!response.ok)throw new Error();const page=readHistoryPage(await response.json());
      if(scope.active){setRows(old=>next?[...old,...page.entries.filter(entry=>!old.some(row=>row.id===entry.id))]:page.entries);setCursor(page.nextCursor);}
    }catch{if(scope.active)setError("Não foi possível carregar o histórico.");}
    finally{scope.writing=false;if(scope.active)setBusy(false);}
  };
  return <section className="room-history"><button type="button" aria-expanded={open} onClick={()=>{if(!open)void load();setOpen(!open);}}>{kind==="messages"?"Histórico de mensagens":"Histórico de entradas e administração"}</button>
    {open&&<>{busy&&<p role="status">Carregando…</p>}{error&&<p role="alert">{error}</p>}<ol>{rows.map(row=><li key={row.id}><strong>{row.name}</strong><time dateTime={row.at}>{new Date(row.at).toLocaleString("pt-BR")}</time><p>{row.text}</p></li>)}</ol>{!busy&&!error&&!rows.length&&<p>Nenhum registro disponível.</p>}{cursor&&<button type="button" disabled={busy} onClick={()=>void load(cursor)}>Carregar registros anteriores</button>}</>}
  </section>;
}
