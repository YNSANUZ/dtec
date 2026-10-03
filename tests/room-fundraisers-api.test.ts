import { beforeEach, describe, expect, it, vi } from "vitest";
type Row=Record<string,unknown>;
type PreviewBody={fundraisers:Array<{photos:Array<{photoUrl:string|null}>;paid:Row[];pending:Row[]}>};
const state=vi.hoisted(()=>({loggedIn:true,actor:"11111111-1111-4111-8111-111111111111",staff:[] as Row[],campaigns:[] as Row[],participants:[] as Row[],payments:[] as Row[],audit:[] as Row[],stale:false,photoCalls:[] as string[][],photoError:false,extraProfiles:[] as Row[]}));
const other="22222222-2222-4222-8222-222222222222", idA="33333333-3333-4333-8333-333333333333",idB="44444444-4444-4444-8444-444444444444";
function client(){return {from(table:string){
  const filters:Row={};let mode="read",payload:Row={};
  const rows=()=>table==="room_memberships"?[{room_slug:"amigos",user_id:state.actor,status:"active"},{room_slug:"outra",user_id:state.actor,status:"active"}]:table==="rooms"?[{slug:"amigos"},{slug:"outra"},{slug:"dtec"}]:table==="room_staff"?state.staff:table==="fundraisers"?state.campaigns:table==="fundraiser_participants"?state.participants:table==="fundraiser_contributions"?state.payments:table==="fundraiser_payment_audit"?state.audit:[{user_id:state.actor,display_name:"Ana Silva",avatar_id:"a",title:""},{user_id:other,display_name:"Beto Lima",avatar_id:"c",title:""},...state.extraProfiles];
  const matches=(r:Row)=>Object.entries(filters).every(([k,v])=>Array.isArray(v)?v.includes(r[k]):r[k]===v);
  const run=()=>{let data=rows().filter(matches);
    if(mode==="insert"){data=[{id:"55555555-5555-4555-8555-555555555555",status:"open",active:true,...payload}];(table==="fundraisers"?state.campaigns:state.participants).push(data[0]);}
    if(mode==="update")data.forEach(r=>Object.assign(r,payload));return {data,error:null};};
  const q={select(){return q;},eq(k:string,v:unknown){filters[k]=v;return q;},in(k:string,v:unknown[]){filters[k]=v;return q;},order(){return q;},limit(){return q;},insert(v:Row){mode="insert";payload=v;return q;},update(v:Row){mode="update";payload=v;return q;},
    async maybeSingle(){const r=run();return {...r,data:r.data[0]??null};},async single(){const r=run();return {...r,data:r.data[0]??null};},then(resolve:(v:unknown)=>unknown,reject?:(e:unknown)=>unknown){return Promise.resolve(run()).then(resolve,reject);}};return q;
},async rpc(name:string,args:Row){
  if(name==="room_google_photos") { const ids=args.p_user_ids as string[];state.photoCalls.push(ids);return {data:ids.map(user_id=>({user_id,photo_url:`https://lh3.googleusercontent.com/${user_id}`})),error:state.photoError?{code:"failed"}:null}; }
  const parent=state.campaigns.find(c=>c.id===args.p_fundraiser_id&&c.room_slug===args.p_room_slug);
  if(!parent)return {data:null,error:{code:"P0002"}};
  if(name==="ensure_room_fundraiser_current_cycle")return {data:"2026-10-10",error:null};
  if(state.stale)return {data:null,error:{code:"22023"}};
  const payment=state.payments.find(p=>p.fundraiser_id===parent.id&&p.user_id===args.p_participant_id);
  if(payment)payment.status=args.p_paid?"paid":"pending";return {data:true,error:null};
}};}
vi.mock("@/lib/mural-server",()=>({getMuralUserContext:vi.fn(async()=>state.loggedIn?{supabase:client(),userId:state.actor,displayName:"Ana Silva"}:null)}));
const ctx=(slug="amigos",id=idA,userId=state.actor)=>({params:Promise.resolve({slug,id,userId})});
const req=(method="GET",body?:unknown,url="https://cubo.test/api/rooms/amigos/fundraisers")=>new Request(url,{method,...(body===undefined?{}:{headers:{"content-type":"application/json"},body:JSON.stringify(body)})});
describe("room fundraiser API",()=>{
  beforeEach(()=>{state.loggedIn=true;state.stale=false;state.staff=[];state.audit=[];state.photoCalls=[];state.photoError=false;state.extraProfiles=[];
    state.campaigns=[{id:idA,room_slug:"amigos",title:"A",description:"",monthly_amount_cents:2500,due_day:10,pix_key:"pix-test",payment_instructions:"Dia 10",status:"open"},{id:idB,room_slug:"outra",title:"B",status:"open"}];
    state.participants=[{fundraiser_id:idA,user_id:state.actor,active:true},{fundraiser_id:idA,user_id:other,active:true}];
    state.payments=[{fundraiser_id:idA,user_id:state.actor,cycle_due_date:"2026-10-10",status:"paid",marked_at:"now"},{fundraiser_id:idA,user_id:other,cycle_due_date:"2026-10-10",status:"pending",marked_at:null}];
  });
  it("previews active participants from only this room, deduplicated, without changing payment lists",async()=>{
    state.participants.push({fundraiser_id:idA,user_id:state.actor,active:true},{fundraiser_id:idA,user_id:"inactive",active:false},{fundraiser_id:idB,user_id:"foreign",active:true});
    const {GET}=await import("@/app/api/rooms/[slug]/fundraisers/route");
    const body=await (await GET(req(),ctx())).json() as PreviewBody;
    expect(body.fundraisers[0].photos).toEqual([{photoUrl:`https://lh3.googleusercontent.com/${state.actor}`},{photoUrl:`https://lh3.googleusercontent.com/${other}`}]);
    expect(body.fundraisers[0].paid).toHaveLength(1);expect(body.fundraisers[0].pending).toHaveLength(1);
    expect(state.photoCalls.flat()).toEqual([state.actor,other]);
    state.loggedIn=false;state.photoCalls=[];expect((await GET(req(),ctx())).status).toBe(401);expect(state.photoCalls).toEqual([]);
  });
  it("a failed photo RPC uses placeholders, while an empty campaign requests no photos",async()=>{
    state.photoError=true;
    const {GET}=await import("@/app/api/rooms/[slug]/fundraisers/route");
    const response=await GET(req(),ctx());expect(response.status).toBe(200);
    const body=await response.json() as PreviewBody;expect(body.fundraisers[0].photos).toEqual([{photoUrl:null},{photoUrl:null}]);expect(body.fundraisers[0].paid).toHaveLength(1);
    state.participants=[];state.photoCalls=[];
    const empty=await (await GET(req(),ctx())).json() as PreviewBody;expect(empty.fundraisers[0].photos).toEqual([]);expect(state.photoCalls).toEqual([]);
  });
  it("caps photo requests at six while preserving all eight participants",async()=>{
    state.extraProfiles=Array.from({length:6},(_,i)=>({user_id:`extra${i}`,display_name:`Pessoa ${i}`,avatar_id:"a",title:""}));
    state.participants.push(...state.extraProfiles.map(p=>({fundraiser_id:idA,user_id:p.user_id,active:true})));
    const {GET}=await import("@/app/api/rooms/[slug]/fundraisers/route");const body=await (await GET(req(),ctx())).json() as PreviewBody;
    expect(body.fundraisers[0].photos).toHaveLength(6);expect(state.photoCalls.flat()).toHaveLength(6);
    expect(body.fundraisers[0].paid.length+body.fundraisers[0].pending.length).toBe(8);
    expect(body.fundraisers[0]).not.toHaveProperty("totalCollected");
  });
  it("returns only this room's paid/pending people, amount, date and Pix without a total or audit",async()=>{
    const {GET}=await import("@/app/api/rooms/[slug]/fundraisers/route");const response=await GET(req(),ctx());
    const body=await response.json() as {fundraisers:Row[]};expect(response.status).toBe(200);expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(body.fundraisers).toHaveLength(1);expect(body.fundraisers[0]).toMatchObject({id:idA,monthlyAmountCents:2500,pixKey:"pix-test",dueDay:10,paid:[{userId:state.actor}],pending:[{userId:other}]});
    expect(body.fundraisers[0]).not.toHaveProperty("totalCollected");expect(body.fundraisers[0]).not.toHaveProperty("audit");
    state.loggedIn=false;expect((await GET(req(),ctx())).status).toBe(401);
  });
  it("allows member creation and staff editing, ignoring forged room or creator",async()=>{
    const {POST}=await import("@/app/api/rooms/[slug]/fundraisers/route");const {PATCH}=await import("@/app/api/rooms/[slug]/fundraisers/[id]/route");
    const data={title:"Nova",monthlyAmountCents:1000,dueDay:5,room_slug:"outra",created_by:other};
    expect((await POST(req("POST",data),ctx())).status).toBe(201);
    state.staff=[{room_slug:"amigos",user_id:state.actor,role:"owner"}];
    expect((await POST(req("POST",data),ctx())).status).toBe(201);expect(state.campaigns.at(-1)).toMatchObject({room_slug:"amigos",created_by:state.actor});
    expect((await PATCH(req("PATCH",{dueDay:12}),ctx())).status).toBe(200);expect(state.campaigns[0].due_day).toBe(12);
    expect((await PATCH(req("PATCH",{title:"Invadido"}),ctx("amigos",idB))).status).toBe(404);
    expect((await PATCH(req("PATCH",{title:"Invadido"}),ctx("outra",idB))).status).toBe(403);
  });
  it("allows self payment and own-room staff corrections, with stale cycles returning 409",async()=>{
    const {POST}=await import("@/app/api/rooms/[slug]/fundraisers/[id]/contributions/[userId]/route");
    expect((await POST(req("POST",{paid:false}),ctx())).status).toBe(200);expect(state.payments[0].status).toBe("pending");
    expect((await POST(req("POST",{paid:true}),ctx("amigos",idA,other))).status).toBe(403);
    expect((await POST(req("POST",{paid:true}),ctx("amigos",idB))).status).toBe(404);
    state.staff=[{room_slug:"amigos",user_id:state.actor,role:"leader"}];expect((await POST(req("POST",{paid:true}),ctx("amigos",idA,other))).status).toBe(200);
    state.stale=true;expect((await POST(req("POST",{paid:true}),ctx())).status).toBe(409);
  });
  it("checks campaign room before joining/leaving and rejects changes to another person's participation",async()=>{
    const {POST,DELETE}=await import("@/app/api/rooms/[slug]/fundraisers/[id]/participants/route");
    expect((await POST(req("POST"),ctx("amigos",idB))).status).toBe(404);expect((await DELETE(req("DELETE"),ctx("amigos",idB))).status).toBe(404);
    expect((await DELETE(req("DELETE",{userId:other}),ctx())).status).toBe(403);
    expect((await DELETE(req("DELETE"),ctx())).status).toBe(200);expect(state.participants[0].active).toBe(false);
    expect((await POST(req("POST"),ctx())).status).toBe(200);expect(state.participants[0].active).toBe(true);
  });
  it("exposes audit only to own-room staff and never accepts a foreign campaign ID",async()=>{
    const {GET}=await import("@/app/api/rooms/[slug]/fundraisers/[id]/route");
    state.audit=[{id:"audit-a",fundraiser_id:idA,source:"self"},{id:"audit-b",fundraiser_id:idB,source:"adm"}];
    expect((await GET(req(),ctx())).status).toBe(403);
    state.staff=[{room_slug:"amigos",user_id:state.actor,role:"owner"}];
    expect(await (await GET(req(),ctx())).json()).toMatchObject({audit:[{id:"audit-a"}]});
    expect((await GET(req(),ctx("amigos",idB))).status).toBe(404);
    expect((await GET(req(),ctx("outra",idB))).status).toBe(403);
  });
});
