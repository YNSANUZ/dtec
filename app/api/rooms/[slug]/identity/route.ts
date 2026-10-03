import {NextResponse} from "next/server";
import {createServerSupabaseClient} from "@/lib/supabase/server";
import {normalizeRoomSlug} from "@/lib/rooms/slug";
export async function GET(_request:Request,ctx:{params:Promise<{slug:string}>}){
  let slug:string;try{slug=normalizeRoomSlug((await ctx.params).slug);}catch{return NextResponse.json({error:"invalid_room"},{status:400});}
  const supabase=await createServerSupabaseClient();if(!supabase)return NextResponse.json({error:"room_unavailable"},{status:503});
  const {data,error}=await supabase.from("rooms").select("title,description").eq("slug",slug).maybeSingle();
  if(error)return NextResponse.json({error:"identity_read_failed"},{status:500});
  if(!data)return NextResponse.json({error:"room_not_found"},{status:404});
  return NextResponse.json(data,{headers:{"Cache-Control":"no-store"}});
}
