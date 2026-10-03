import { roomIdentity } from "@/lib/rooms/identity";
import { NextResponse } from "next/server";
import { getRoomMuralContext } from "@/lib/rooms/mural-server";
import { hasRoomRole } from "@/lib/rooms/authorization";
import { admissionSettings,isGuestToken } from "@/lib/rooms/admission";
type Context={params:Promise<{slug:string}>};
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
async function staffContext(ctx:Context){
  const access=await getRoomMuralContext((await ctx.params).slug);if(!access.ok)return access;
  const role=await hasRoomRole(access.context,access.slug,["owner","leader"]);
  return role.failed?{ok:false as const,response:json({error:"permission_check_failed"},500)}:!role.allowed?{ok:false as const,response:json({error:"forbidden"},403)}:access;
}
export async function GET(_request:Request,ctx:Context){
  const access=await staffContext(ctx);if(!access.ok)return access.response;
  const {data,error}=await access.context.supabase.from("room_admission_settings").select("entry_mode,invite_lifetime").eq("room_slug",access.slug).maybeSingle();
  if(error)return json({error:"settings_read_failed"},500);
  const identity=await access.context.supabase.from("rooms").select("title,description").eq("slug",access.slug).single();
  if(identity.error)return json({error:"settings_read_failed"},500);
  return json({...identity.data,entryMode:data?.entry_mode??"public",inviteLifetime:data?.invite_lifetime??"10m"});
}
export async function POST(request:Request,ctx:Context){
  const access=await staffContext(ctx);if(!access.ok)return access.response;
  let body:Record<string,unknown>;
  try{const input:unknown=await request.json();if(!input||typeof input!=="object"||Array.isArray(input))throw new Error();body=input as Record<string,unknown>;}catch{return json({error:"invalid_settings"},400);}
  if(body.intent==="identity"){
    let identity;try{identity=roomIdentity(body);}catch{return json({error:"invalid_identity"},400);}
    const {error}=await access.context.supabase.rpc("edit_room_identity",{p_room_slug:access.slug,p_title:identity.title,p_description:identity.description});
    if(error)return json({error:"identity_save_failed"},error.code==="42501"?403:500);
    return json(identity);
  }
  if(body.intent==="reset"){
    const {data,error}=await access.context.supabase.rpc("issue_room_invite",{p_room_slug:access.slug});
    if(error||!isGuestToken(data))return json({error:error?.code==="42501"?"forbidden":"invite_reset_failed"},error?.code==="42501"?403:409);
    return json({token:data});
  }
  if(body.intent!=="save")return json({error:"invalid_settings"},400);
  let settings;
  try{settings=admissionSettings(body);}catch{return json({error:"invalid_settings"},400);}
  const {error}=await access.context.supabase.rpc("set_room_entry_mode",{p_room_slug:access.slug,p_mode:settings.entryMode,p_lifetime:settings.inviteLifetime});
  if(error)return json({error:error.code==="42501"?"forbidden":"settings_save_failed"},error.code==="42501"?403:500);
  return json(settings);
}
