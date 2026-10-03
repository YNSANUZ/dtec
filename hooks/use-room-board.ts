"use client";
import { useCallback, useEffect, useState } from "react";
import { scenePanels, type BoardNode } from "@/lib/rooms/board-types";

export function useRoomBoard(roomSlug:string,userId:string|null) {
  const key=`${roomSlug}:${userId??"visitor"}`;
  const [result,setResult]=useState<{key:string;nodes:BoardNode[];canManage:boolean;canRemovePanels:boolean;error?:string}>();
  const [revision,setRevision]=useState(0);
  const refresh=useCallback(()=>setRevision(n=>n+1),[]);
  useEffect(()=>{
    if(!userId)return;
    let active=true,loading=false;
    const controller=new AbortController();
    const load=async()=>{
      if(loading||!active)return;loading=true;
      try{
        const response=await fetch(`/api/rooms/${roomSlug}/boards`,{cache:"no-store",signal:controller.signal});
        if(!response.ok)throw new Error();
        const body=await response.json() as {nodes:BoardNode[];canManage:boolean;canRemovePanels?:boolean};
        if(!Array.isArray(body.nodes))throw new Error();
        if(active)setResult(previous=>previous?.key===key&&JSON.stringify(previous.nodes)===JSON.stringify(body.nodes)&&previous.canManage===body.canManage&&previous.canRemovePanels===Boolean(body.canRemovePanels)&&!previous.error?previous:{key,nodes:body.nodes,canManage:body.canManage,canRemovePanels:Boolean(body.canRemovePanels)});
      }catch{if(active)setResult({key,nodes:[],canManage:false,canRemovePanels:false,error:"Não foi possível carregar a organização da sala."});}
      finally{loading=false;}
    };
    void load();const timer=setInterval(()=>void load(),10000);
    return()=>{active=false;controller.abort();clearInterval(timer);};
  },[key,roomSlug,userId,revision]);
  const current=userId&&result?.key===key?result:undefined;
  return {nodes:current?.nodes??[],panels:current?scenePanels(current.nodes):undefined,canManage:current?.canManage??false,canRemovePanels:current?.canRemovePanels??false,error:current?.error,loading:Boolean(userId&&!current),refresh};
}
