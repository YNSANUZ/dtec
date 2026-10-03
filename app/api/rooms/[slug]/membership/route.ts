import { isGuestToken } from "@/lib/rooms/admission";
import { NextResponse } from "next/server";
import { getRoomMuralContext } from "@/lib/rooms/mural-server";
type Context={params:Promise<{slug:string}>};
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET(_request:Request,ctx:Context){
  const access=await getRoomMuralContext((await ctx.params).slug,false);if(!access.ok)return access.response;
  const {data,error}=await access.context.supabase.from("room_memberships").select("status").eq("room_slug",access.slug).eq("user_id",access.context.userId).maybeSingle();
  if(error)return json({error:"membership_read_failed"},500);
  const staff=await access.context.supabase.from("room_staff").select("role").eq("room_slug",access.slug).eq("user_id",access.context.userId).maybeSingle();
  if(staff.error)return json({error:"membership_read_failed"},500);
  const request=data?.status!=="active"&&data?.status!=="banned"?await access.context.supabase.from("room_join_requests").select("status").eq("room_slug",access.slug).eq("user_id",access.context.userId).maybeSingle():null;
  if(request?.error)return json({error:"membership_read_failed"},500);
  const settings=await access.context.supabase.from("room_admission_settings").select("entry_mode").eq("room_slug",access.slug).maybeSingle();
  if(settings.error)return json({error:"membership_read_failed"},500);
  return json({entryMode:settings.data?.entry_mode??"public",status:data?.status==="banned"?"banned":data?.status==="active"?"active":request?.data?.status==="pending"?"pending":data?.status??"visitor",role:data?.status==="active"?(staff.data?.role??"member"):"visitor"});
}
async function mutate(ctx:Context,leave:boolean,request?:Request){
  const access=await getRoomMuralContext((await ctx.params).slug,false);if(!access.ok)return access.response;
  let token:string|undefined;
  if(!leave&&request){try{const text=await request.text();if(text){const body:unknown=JSON.parse(text);if(!body||typeof body!=="object"||Array.isArray(body))throw new Error();if(Object.hasOwn(body,"token")){const supplied=(body as Record<string,unknown>).token;if(!isGuestToken(supplied))throw new Error();token=supplied;}}}catch{return json({error:"invalid_token"},400);}}
  const {data,error}=await access.context.supabase.rpc(leave?"leave_content_room":token?"redeem_room_invite":"join_content_room",{p_room_slug:access.slug,...(token?{p_token:token}:{})});
  if(token&&!error&&data!==true)return json({error:"invalid_expired_or_limited_token"},403);
  if(error)return json({error:error.code==="42501"?"membership_forbidden":"membership_write_failed"},error.code==="42501"?403:500);
  return leave?json({ok:true}):GET(new Request("https://membership.invalid"),ctx);
}
export const POST=(request:Request,ctx:Context)=>mutate(ctx,false,request);
export const DELETE=(_request:Request,ctx:Context)=>mutate(ctx,true);
