import { NextResponse } from "next/server";
import { getRoomMuralContext } from "./mural-server";
import { hasRoomRole } from "./authorization";
import { boardNodeInput, boardNodePatch } from "./board-types";
import { normalizeMuralMessageId } from "@/lib/mural-validation";
const fields="id,parent_id,title,kind,content_kind,sort_order,legacy_key";
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export function contentFolderInput(input:unknown):unknown {return input&&typeof input==="object"&&!Array.isArray(input)?(input as Record<string,unknown>).boardNodeId:undefined;}

export async function readRoomBoard(slug:string) {
  const access=await getRoomMuralContext(slug); if(!access.ok)return access.response;
  const [result,staff]=await Promise.all([
    access.context.supabase.from("room_board_nodes").select(fields).eq("room_slug",access.slug).eq("archived",false).order("sort_order").order("id"),
    hasRoomRole(access.context,access.slug,["owner","leader"]),
  ]);
  if(result.error||staff.failed)return json({error:"board_read_failed"},500);
  const owner=await hasRoomRole(access.context,access.slug,["owner"]);
  if(owner.failed)return json({error:"board_read_failed"},500);
  return json({canManage:staff.allowed,canRemovePanels:owner.allowed,nodes:(result.data??[]).map(n=>({id:n.id,parentId:n.parent_id,title:n.title,kind:n.kind,contentKind:n.content_kind,order:n.sort_order,legacyKey:n.legacy_key}))});
}
export async function changeRoomBoard(request:Request,slug:string,idInput?:string,remove=false) {
  const access=await getRoomMuralContext(slug);if(!access.ok)return access.response;
  const staff=await hasRoomRole(access.context,access.slug,["owner","leader"]);
  if(staff.failed)return json({error:"permission_check_failed"},500);
  if(!staff.allowed)return json({error:"forbidden"},403);
  let id:string|undefined;
  try {if(idInput)id=normalizeMuralMessageId(idInput);}catch{return json({error:"invalid_node"},400);}
  if(remove&&id){
    const {data:node,error}=await access.context.supabase.from("room_board_nodes").select("kind").eq("room_slug",access.slug).eq("id",id).maybeSingle();
    if(error)return json({error:"board_read_failed"},500);
    if(!node)return json({error:"node_not_found"},404);
    if(node.kind==="panel"){
      const owner=await hasRoomRole(access.context,access.slug,["owner"]);
      if(owner.failed)return json({error:"permission_check_failed"},500);
      if(!owner.allowed)return json({error:"only_adm_removes_panels"},403);
    }
  }
  let values:Record<string,unknown>;
  try {
    if(remove)values={archived:true};
    else if(id){const n=boardNodePatch.parse(await request.json());values={...(n.title!==undefined?{title:n.title}:{}),...(n.parentId!==undefined?{parent_id:n.parentId}:{}),...(n.order!==undefined?{sort_order:n.order}:{})};}
    else {const n=boardNodeInput.parse(await request.json());values={room_slug:access.slug,created_by:access.context.userId,parent_id:n.parentId,title:n.title,kind:n.kind,content_kind:n.contentKind,sort_order:n.order};}
  }catch{return json({error:"invalid_node"},400);}
  const query=id?access.context.supabase.from("room_board_nodes").update(values).eq("room_slug",access.slug).eq("id",id):access.context.supabase.from("room_board_nodes").insert(values);
  const {data,error}=await query.select("id").maybeSingle();
  if(error)return json({error:error.code==="23514"?"folder_not_empty_or_invalid_structure":"board_save_failed"},error.code==="23514"?409:error.code==="42501"?403:500);
  if(!data)return json({error:"node_not_found"},404);
  return json({id:data.id},id?200:201);
}

export async function resolveContentFolder(context: Awaited<ReturnType<typeof getRoomMuralContext>> & { ok:true }, input:unknown, kind:string) {
  if(input===undefined||input===null)return {ok:true as const,id:null};
  let id:string;try{id=normalizeMuralMessageId(String(input));}catch{return {ok:false as const,response:json({error:"invalid_folder"},400)};}
  const {data,error}=await context.context.supabase.from("room_board_nodes").select("id,content_kind,archived").eq("room_slug",context.slug).eq("id",id).maybeSingle();
  if(error)return {ok:false as const,response:json({error:"folder_read_failed"},500)};
  if(!data||data.archived||data.content_kind!==kind)return {ok:false as const,response:json({error:"folder_not_found"},404)};
  return {ok:true as const,id};
}
