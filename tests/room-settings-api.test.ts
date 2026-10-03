import {beforeEach,expect,it,vi} from "vitest";
import {readHistoryPage} from "@/lib/rooms/history";
const actor="11111111-1111-4111-8111-111111111111",other="22222222-2222-4222-8222-222222222222";
const state=vi.hoisted(()=>({logged:true,active:true,role:"owner",fail:"",calls:[] as {name:string;args:Record<string,unknown>}[],reads:[] as {table:string;filters:Record<string,unknown>;fields:string}[],history:[] as Record<string,unknown>[]}));
function client(){return{
  async rpc(name:string,args:Record<string,unknown>){state.calls.push({name,args});return {data:name==="issue_room_invite"?"ab12":null,error:state.fail==="rpc"?{code:"42501"}:null};},
  from(table:string){
    const filters:Record<string,unknown>={};let fields="";
    const rows=()=>{
      if(table==="rooms")return[{slug:"amigos",title:"Amigos",description:"Grupo da equipe"},{slug:"outra",title:"Outra",description:""}];
      if(table==="room_memberships")return[{room_slug:"amigos",user_id:actor,status:state.active?"active":"left"},{room_slug:"outra",user_id:actor,status:"active"}];
      if(table==="room_staff")return[{room_slug:"amigos",user_id:actor,role:state.role}];
      if(table==="room_admission_settings")return[{room_slug:"amigos",entry_mode:"public",invite_lifetime:"10m"}];
      if(table==="profiles")return[{user_id:actor,display_name:"Ana Silva"},{user_id:other,display_name:"Beto Lima"}];
      return state.history;
    };
    const result=(single=false)=>{
      state.reads.push({table,fields,filters:{...filters}});
      const data=rows().filter(row=>Object.entries(filters).every(([key,value])=>key==="$or"||key==="$limit"||Array.isArray(value)?key.startsWith("$")|| (value as unknown[]).includes(row[key]):row[key]===value)).slice(0,Number(filters.$limit??Infinity));
      return {data:single?data[0]??null:data,error:state.fail===table?{code:"failure"}:null};
    };
    const q={select(value:string){fields=value;return q;},eq(k:string,v:unknown){filters[k]=v;return q;},in(k:string,v:unknown[]){filters[k]=v;return q;},or(v:string){filters.$or=v;return q;},order(){return q;},limit(v:number){filters.$limit=v;return q;},async single(){return result(true);},async maybeSingle(){return result(true);},then(resolve:(v:unknown)=>unknown,reject?:(e:unknown)=>unknown){return Promise.resolve(result()).then(resolve,reject);}};
    return q;
  }
};}
vi.mock("@/lib/mural-server",()=>({getMuralUserContext:async()=>state.logged?{supabase:client(),userId:actor,displayName:"Ana Silva"}:null}));
const ctx=(slug="amigos")=>({params:Promise.resolve({slug})});
const req=(body:unknown)=>new Request("https://cubo.invalid/api/rooms/amigos/settings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
beforeEach(()=>{state.logged=true;state.active=true;state.role="owner";state.fail="";state.calls=[];state.reads=[];state.history=[];});
it.each(["owner","leader"])("loads only the requested room's settings for %s and marks them private",async role=>{
  state.role=role;const {GET}=await import("@/app/api/rooms/[slug]/settings/route");const response=await GET(new Request("https://cubo.invalid"),ctx());
  expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toMatchObject({title:"Amigos",description:"Grupo da equipe",entryMode:"public",inviteLifetime:"10m"});
});
it.each(["anonymous","visitor","member","foreign staff","error"])("blocks settings/history before private children for %s",async situation=>{
  if(situation==="anonymous")state.logged=false;if(situation==="visitor")state.active=false;if(situation==="member")state.role="member";if(situation==="error")state.fail="room_staff";
  const slug=situation==="foreign staff"?"outra":"amigos";
  const {GET}=await import("@/app/api/rooms/[slug]/settings/route");const {GET:history}=await import("@/app/api/rooms/[slug]/settings/history/route");
  expect((await GET(new Request("https://cubo.invalid"),ctx(slug))).status).toBeGreaterThanOrEqual(400);
  expect((await history(new Request("https://cubo.invalid?kind=entries"),ctx(slug))).status).toBeGreaterThanOrEqual(400);
  expect(state.reads.some(read=>["room_history","room_admission_settings","room_chat_messages"].includes(read.table))).toBe(false);
});
it.each(["10m","1h","1d","1mo"])("saves enumerated duration %s, never a submitted foreign room or actor",async inviteLifetime=>{
  const {POST}=await import("@/app/api/rooms/[slug]/settings/route");expect((await POST(req({intent:"save",entryMode:"protected",inviteLifetime,room_slug:"outra",actor:other}),ctx())).status).toBe(200);
  expect(state.calls).toEqual([{name:"set_room_entry_mode",args:{p_room_slug:"amigos",p_mode:"protected",p_lifetime:inviteLifetime}}]);
});
it.each([{intent:"save",entryMode:"bogus",inviteLifetime:"10m"},{intent:"save",entryMode:"public",inviteLifetime:"forever"},{intent:"identity",title:"X",description:""},{intent:"identity",title:"Ok group",description:"x".repeat(281)}])("rejects invalid settings without an RPC",async body=>{
  const {POST}=await import("@/app/api/rooms/[slug]/settings/route");expect((await POST(req(body),ctx())).status).toBe(400);expect(state.calls).toEqual([]);
});
it("resets the scoped token and edits only identity through authenticated RPCs",async()=>{
  const {POST}=await import("@/app/api/rooms/[slug]/settings/route");
  expect(await(await POST(req({intent:"reset",room_slug:"outra"}),ctx())).json()).toEqual({token:"ab12"});
  expect((await POST(req({intent:"identity",title:" Novo grupo ",description:" Equipe ",created_by:other}),ctx())).status).toBe(200);
  expect(state.calls).toEqual([{name:"issue_room_invite",args:{p_room_slug:"amigos"}},{name:"edit_room_identity",args:{p_room_slug:"amigos",p_title:"Novo grupo",p_description:"Equipe"}}]);
  state.fail="rpc";expect((await POST(req({intent:"reset"}),ctx())).status).toBe(403);
});
it("paginates scoped message history with a validated cursor and no tokens or audit internals",async()=>{
  state.history=Array.from({length:31},(_,i)=>({id:`00000000-0000-4000-8000-${String(i).padStart(12,"0")}`,room_slug:"amigos",author_id:actor,content:`Mensagem ${i}`,created_at:"2026-10-03T04:00:00Z"}));
  const {GET}=await import("@/app/api/rooms/[slug]/settings/history/route");
  const response=await GET(new Request("https://cubo.invalid?kind=messages"),ctx()),body=readHistoryPage(await response.json());
  expect(body.entries).toHaveLength(30);expect(body.entries[0]).toMatchObject({name:"Ana Silva",text:"Mensagem 0"});expect(body.nextCursor).toContain("|");
  expect(state.reads.find(read=>read.table==="room_chat_messages")?.filters.room_slug).toBe("amigos");
  expect((await GET(new Request(`https://cubo.invalid?kind=messages&cursor=${encodeURIComponent(body.nextCursor!)}`),ctx())).status).toBe(200);
  expect((await GET(new Request("https://cubo.invalid?cursor=),room_slug.eq.outra"),ctx())).status).toBe(400);
});
it("explains an ownerless transfer and labels the imported baseline as unknown, not an invented entry date",async()=>{
  state.history=[{id:"history",room_slug:"amigos",event_kind:"ownership",actor_id:actor,target_id:null,happened_at:"2026-10-03T04:00:00Z",details:{}},{id:"baseline",room_slug:"amigos",event_kind:"baseline",target_id:other,happened_at:"2026-10-03T04:00:00Z",details:{}}];
  const {GET}=await import("@/app/api/rooms/[slug]/settings/history/route");const body=readHistoryPage(await(await GET(new Request("https://cubo.invalid"),ctx())).json());
  expect(body.entries[0].text).toContain("sem proprietário");expect(body.entries[1].text).toContain("desconhecida");
});
