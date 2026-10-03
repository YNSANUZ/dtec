"use client";
import { useEffect, useRef, useState } from "react";
type Entry={userId:string;name:string;requestedAt:string};
export function RoomAdmissions({roomSlug}:{roomSlug:string}){
  const [open,setOpen]=useState(false),[entries,setEntries]=useState<Entry[]>([]),[error,setError]=useState(""),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
  const activeScope=useRef<{active:boolean;writing:boolean}>({active:false,writing:false});
  useEffect(()=>{
    const scope={active:open,writing:false};activeScope.current=scope;
    if(!open)return;
    const controller=new AbortController();
    void(async()=>{try{
      const response=await fetch(`/api/rooms/${roomSlug}/admissions`,{cache:"no-store",signal:controller.signal});
      if(!response.ok)throw new Error();const body=await response.json() as {requests:Entry[]};
      if(!Array.isArray(body.requests))throw new Error();if(scope.active)setEntries(body.requests);
    }catch{if(scope.active)setError("Não foi possível carregar as solicitações.");}})();
    return()=>{scope.active=false;controller.abort();};
  },[open,roomSlug,revision]);
  const review=async(userId:string,accept:boolean)=>{
    const scope=activeScope.current;if(!scope.active||scope.writing)return;scope.writing=true;setBusy(true);setError("");
    try{const response=await fetch(`/api/rooms/${roomSlug}/admissions`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId,accept})});
      if(!response.ok)throw new Error();if(scope.active)setRevision(n=>n+1);
    }catch{if(scope.active)setError("Não foi possível analisar esta entrada. Atualize e tente novamente.");}
    finally{scope.writing=false;if(scope.active)setBusy(false);}
  };
  return <section><button type="button" aria-expanded={open} onClick={()=>{activeScope.current.active=false;setError("");setEntries([]);setBusy(false);setOpen(value=>!value);}}>Solicitações de entrada</button>{open&&<div aria-label="Solicitações de entrada">{error&&<p role="alert">{error}</p>}{entries.length?entries.map(entry=><div key={entry.userId}><strong>{entry.name}</strong><button type="button" disabled={busy} onClick={()=>void review(entry.userId,true)}>Aceitar</button><button type="button" disabled={busy} onClick={()=>void review(entry.userId,false)}>Recusar</button></div>):!error&&<p>Nenhuma solicitação carregada.</p>}</div>}</section>;
}
