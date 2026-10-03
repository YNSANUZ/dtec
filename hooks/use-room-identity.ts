"use client";
import {useEffect,useState,useCallback} from "react";
import {roomIdentity,type RoomIdentity} from "@/lib/rooms/identity";
export function useRoomIdentity(slug:string,initial:RoomIdentity){
  const [result,setResult]=useState<{slug:string;identity:RoomIdentity}>(),[revision,setRevision]=useState(0);
  const refresh=useCallback(()=>setRevision(n=>n+1),[]);
  useEffect(()=>{
    let active=true,loading=false;const controller=new AbortController();
    const read=async()=>{
      if(!active||loading)return;loading=true;
      try{const response=await fetch(`/api/rooms/${slug}/identity`,{cache:"no-store",signal:controller.signal});
        if(!response.ok)return;const identity=roomIdentity(await response.json());
        if(active)setResult(previous=>previous?.slug===slug&&previous.identity.title===identity.title&&previous.identity.description===identity.description?previous:{slug,identity});
      }catch{/* Keep the last confirmed public title, never reset the scene. */}finally{loading=false;}
    };
    void read();const timer=setInterval(()=>void read(),10000);
    return()=>{active=false;controller.abort();clearInterval(timer);};
  },[slug,revision]);
  return {identity:result?.slug===slug?result.identity:initial,refresh};
}
