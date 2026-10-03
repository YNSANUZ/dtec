import {NextResponse} from "next/server";
import {getRoomMuralContext} from "@/lib/rooms/mural-server";
import {hasRoomRole} from "@/lib/rooms/authorization";
import type {HistoryEntry} from "@/lib/rooms/history";
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
type Row={id:string;created_at?:string;happened_at?:string;author_id?:string;actor_id?:string;target_id?:string;content?:string;event_kind?:string;details?:Record<string,unknown>};
export async function GET(request:Request,ctx:{params:Promise<{slug:string}>}){
  const access=await getRoomMuralContext((await ctx.params).slug);if(!access.ok)return access.response;
  const role=await hasRoomRole(access.context,access.slug,["owner","leader"]);
  if(role.failed)return json({error:"permission_check_failed"},500);
  if(!role.allowed)return json({error:"forbidden"},403);
  const params=new URL(request.url).searchParams,kind=params.get("kind")??"entries";
  if(!["entries","messages"].includes(kind))return json({error:"invalid_history"},400);
  const messages=kind==="messages",timeField=messages?"created_at":"happened_at";
  let query=messages
    ?access.context.supabase.from("room_chat_messages").select("id,author_id,content,created_at").eq("room_slug",access.slug)
    :access.context.supabase.from("room_history").select("id,event_kind,actor_id,target_id,happened_at,details").eq("room_slug",access.slug);
  const cursor=params.get("cursor");
  if(cursor){
    const [at,id,...extra]=cursor.split("|");
    if(extra.length||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(at)||!Number.isFinite(Date.parse(at))||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return json({error:"invalid_cursor"},400);
    query=query.or(`${timeField}.lt.${at},and(${timeField}.eq.${at},id.lt.${id})`);
  }
  const {data,error}=await query.order(timeField,{ascending:false}).order("id",{ascending:false}).limit(31);
  if(error)return json({error:"history_read_failed"},500);
  const rows=(data??[]) as Row[],page=rows.slice(0,30);
  const ids=[...new Set(page.flatMap(row=>[row.author_id,row.actor_id,row.target_id].filter((id):id is string=>Boolean(id))))];
  const profiles=ids.length?await access.context.supabase.from("profiles").select("user_id,display_name").in("user_id",ids):{data:[],error:null};
  if(profiles.error)return json({error:"history_names_failed"},500);
  const names=new Map((profiles.data??[]).map(row=>[row.user_id,row.display_name]));
  const name=(id?:string)=>id?names.get(id)??"Membro":"Sistema";
  const entries:HistoryEntry[]=page.map(row=>{
    const details=row.details??{};
    const status=details.status==="active"?"Entrou no grupo":details.status==="left"?"Saiu do grupo":details.status==="banned"?"Acesso bloqueado":"Participação atualizada";
    const text=messages?row.content??"":row.event_kind==="baseline"?"Participação existente no início do histórico; data original de entrada desconhecida.":row.event_kind==="ownership"?`${name(row.actor_id)} saiu definitivamente. ${row.target_id?`Novo ADM: ${name(row.target_id)}.`:"Sem participante elegível; sala sem proprietário."}`:row.event_kind==="identity"?"Nome ou descrição da sala alterados.":row.event_kind==="moderator"?`${name(row.target_id)}: ${details.enabled?"designado MOD":"MOD removido"}.`:status;
    return {id:row.id,at:(row.created_at??row.happened_at)!,name:name(row.author_id??row.target_id??row.actor_id),text};
  });
  const last=page.at(-1);
  return json({entries,nextCursor:rows.length>30&&last?`${last.created_at??last.happened_at}|${last.id}`:null});
}
