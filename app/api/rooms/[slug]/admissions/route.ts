import { NextResponse } from "next/server";
import { getRoomMuralContext } from "@/lib/rooms/mural-server";
import { hasRoomRole } from "@/lib/rooms/authorization";
import { normalizeMuralMessageId } from "@/lib/mural-validation";
type Context={params:Promise<{slug:string}>};
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
async function staffContext(ctx:Context){
  const access=await getRoomMuralContext((await ctx.params).slug);
  if(!access.ok)return access;
  const staff=await hasRoomRole(access.context,access.slug,["owner","leader"]);
  if(staff.failed)return {ok:false as const,response:json({error:"permission_check_failed"},500)};
  if(!staff.allowed)return {ok:false as const,response:json({error:"forbidden"},403)};
  return access;
}
export async function GET(_request:Request,ctx:Context){
  const access=await staffContext(ctx);if(!access.ok)return access.response;
  const {data,error}=await access.context.supabase.from("room_join_requests").select("user_id, requested_at").eq("room_slug",access.slug).eq("status","pending").order("requested_at").limit(100);
  if(error)return json({error:"admissions_read_failed"},500);
  const ids=(data??[]).map(row=>row.user_id);
  const profiles=ids.length?await access.context.supabase.from("profiles").select("user_id, display_name").in("user_id",ids):{data:[],error:null};
  if(profiles.error)return json({error:"admissions_read_failed"},500);
  const names=new Map((profiles.data??[]).map(row=>[row.user_id,row.display_name]));
  return json({requests:(data??[]).map(row=>({userId:row.user_id,name:names.get(row.user_id)??"Membro",requestedAt:row.requested_at}))});
}
export async function POST(request:Request,ctx:Context){
  const access=await staffContext(ctx);if(!access.ok)return access.response;
  let userId:string,accept:boolean;
  try{const input:unknown=await request.json();if(!input||typeof input!=="object"||Array.isArray(input))throw new Error();const body=input as Record<string,unknown>;if(typeof body.userId!=="string")throw new Error();userId=normalizeMuralMessageId(body.userId);if(typeof body.accept!=="boolean")throw new Error();accept=body.accept;}catch{return json({error:"invalid_admission"},400);}
  const {data,error}=await access.context.supabase.rpc("review_room_join_request",{p_room_slug:access.slug,p_user_id:userId,p_accept:accept});
  if(error)return json({error:error.code==="42501"?"forbidden":"admission_write_failed"},error.code==="42501"?403:500);
  return data===true?json({ok:true}):json({error:"request_not_pending"},409);
}
