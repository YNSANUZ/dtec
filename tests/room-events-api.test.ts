import { beforeEach, describe, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({loggedIn:true,staff:[] as Record<string,unknown>[],events:[] as Record<string,unknown>[],interests:[] as Record<string,unknown>[],photoIds:[] as string[],photoError:false}));
const actor="11111111-1111-4111-8111-111111111111", other="22222222-2222-4222-8222-222222222222";
const eventA="33333333-3333-4333-8333-333333333333", eventB="44444444-4444-4444-8444-444444444444";
function client(){return {async rpc(_name:string,args:{p_user_ids:string[]}){state.photoIds.push(...args.p_user_ids);return {data:args.p_user_ids.map(user_id=>({user_id,photo_url:user_id===actor?"https://lh3.googleusercontent.com/ana":"https://foreign.test/no-photo"})),error:state.photoError?{message:"unavailable"}:null};},from(table:string){
  const filters:Record<string,unknown>={};let mode="read",payload:Record<string,unknown>={},from=0,to=Infinity;
  const rows=()=>table==="rooms"?[{slug:"amigos"},{slug:"outra"}]:table==="room_memberships"?[{room_slug:"amigos",user_id:actor,status:"active"},{room_slug:"outra",user_id:actor,status:"active"}]:table==="room_staff"?state.staff:table==="room_events"?state.events:table==="room_event_interests"?state.interests:[{user_id:actor,display_name:"Ana Silva",avatar_id:"a",title:""},{user_id:other,display_name:"Beto Lima",avatar_id:"c",title:""}];
  const matches=(row:Record<string,unknown>)=>Object.entries(filters).every(([k,v])=>Array.isArray(v)?v.includes(row[k]):row[k]===v);
  const execute=()=>{let data=rows().filter(matches).slice(from,to+1);
    if(mode==="insert"){data=[{id:"55555555-5555-4555-8555-555555555555",status:"open",...payload}];(table==="room_events"?state.events:state.interests).push(data[0]);}
    if(mode==="update") data.forEach(row=>Object.assign(row,payload));
    if(mode==="delete")state.interests=state.interests.filter(row=>!matches(row));
    return {data,error:null};};
  const q={select(){return q;},eq(k:string,v:unknown){filters[k]=v;return q;},in(k:string,v:unknown[]){filters[k]=v;return q;},order(){return q;},
    range(start:number,end:number){from=start;to=end;return q;},
    insert(v:Record<string,unknown>){mode="insert";payload=v;return q;},update(v:Record<string,unknown>){mode="update";payload=v;return q;},delete(){mode="delete";return q;},
    async maybeSingle(){const r=execute();return {...r,data:r.data[0]??null};},async single(){const r=execute();return {...r,data:r.data[0]??null};},
    then(resolve:(v:unknown)=>unknown,reject?:(e:unknown)=>unknown){return Promise.resolve(execute()).then(resolve,reject);}};return q;
}};}
vi.mock("@/lib/mural-server",()=>({getMuralUserContext:vi.fn(async()=>state.loggedIn?{supabase:client(),userId:actor,displayName:"Ana Silva"}:null)}));
const ctx=(slug="amigos",id=eventA)=>({params:Promise.resolve({slug,id})});
const req=(method="GET",body?:unknown)=>new Request("https://cubo.test/api/rooms/amigos/events",{method,...(body===undefined?{}:{headers:{"content-type":"application/json"},body:JSON.stringify(body)})});
describe("room events API",()=>{
  beforeEach(()=>{state.loggedIn=true;state.photoIds=[];state.photoError=false;state.staff=[{room_slug:"amigos",user_id:actor,role:"leader"}];state.events=[{id:eventA,room_slug:"amigos",title:"Evento A",description:"",category:"kart",location:"",starts_at:null,status:"open",created_by:other},{id:eventB,room_slug:"outra",title:"Evento B",status:"open"}];state.interests=[{event_id:eventB,user_id:other}];});
  it("reads photos only for this room's event interests and supplies null for non-Google URLs",async()=>{
    const {GET}=await import("@/app/api/rooms/[slug]/events/route");
    state.interests.push({event_id:eventA,user_id:actor});
    expect(await(await GET(req(),ctx())).json()).toMatchObject({events:[{id:eventA,photos:[{photoUrl:"https://lh3.googleusercontent.com/ana"}]}]});
    expect(state.photoIds).toEqual([actor]);
    state.interests.push({event_id:eventA,user_id:other});
    expect(await(await GET(req(),ctx())).json()).toMatchObject({events:[{photos:[{photoUrl:"https://lh3.googleusercontent.com/ana"},{photoUrl:null}]}]});
  });
  it("keeps all counts across interest pages, but requests at most six photos per event",async()=>{
    const {GET}=await import("@/app/api/rooms/[slug]/events/route");
    state.interests=Array.from({length:205},(_,i)=>({event_id:eventA,user_id:`user${i}`}));
    state.interests.push({event_id:eventA,user_id:"user0"},{event_id:eventB,user_id:other});
    const body=await(await GET(req(),ctx())).json() as {events:{interestCount:number;photos:unknown[]}[]};
    expect(body.events[0].interestCount).toBe(205);
    expect(body.events[0].photos).toHaveLength(6);
    expect(state.photoIds).toEqual(["user0","user1","user2","user3","user4","user5"]);
  });
  it("degrades to placeholders on photo RPC failure without losing the event or count",async()=>{
    const {GET}=await import("@/app/api/rooms/[slug]/events/route");
    state.interests.push({event_id:eventA,user_id:actor});state.photoError=true;
    expect(await(await GET(req(),ctx())).json()).toMatchObject({events:[{id:eventA,interestCount:1,photos:[{photoUrl:null}]}]});
    state.loggedIn=false;state.photoIds=[];
    expect((await GET(req(),ctx())).status).toBe(401);
    expect(state.photoIds).toEqual([]);
  });
  it("includes archived events only on explicit request, keeping room scope, counts and authentication",async()=>{
    const {GET}=await import("@/app/api/rooms/[slug]/events/route");
    state.events[0].status="closed"; state.events[1].status="closed";
    state.interests.push({event_id:eventA,user_id:actor});
    expect(await (await GET(req(),ctx())).json()).toEqual({events:[]});
    const archive=new Request("https://cubo.test/api/rooms/amigos/events?includeArchived=1");
    expect(await (await GET(archive,ctx())).json()).toMatchObject({events:[{id:eventA,status:"closed",interestCount:1}]});
    state.loggedIn=false;expect((await GET(archive,ctx())).status).toBe(401);
  });
  it("lists only the opened room and ignores room/creator spoofing on creation",async()=>{
    const {GET,POST}=await import("@/app/api/rooms/[slug]/events/route");
    expect(await (await GET(req(),ctx())).json()).toMatchObject({events:[{id:eventA,interestCount:0}]});
    expect((await POST(req("POST",{title:"Kart",room_slug:"outra",created_by:other}),ctx())).status).toBe(201);
    expect(state.events.at(-1)).toMatchObject({room_slug:"amigos",created_by:actor});
    // A member of both groups may create in both, but does not inherit MOD there.
    expect((await POST(req("POST",{title:"Kart"}),ctx("outra"))).status).toBe(201);
    expect(state.events.at(-1)).toMatchObject({room_slug:"outra",created_by:actor});
    state.loggedIn=false;expect((await GET(req(),ctx())).status).toBe(401);
  });
  it("refuses foreign event IDs and management in another room",async()=>{
    const {PATCH}=await import("@/app/api/rooms/[slug]/events/[id]/route");
    expect((await PATCH(req("PATCH",{status:"closed"}),ctx("amigos",eventB))).status).toBe(404);
    expect((await PATCH(req("PATCH",{status:"closed"}),ctx("outra",eventB))).status).toBe(403);
    expect(state.events[1].status).toBe("open");
    expect((await PATCH(req("PATCH",{status:"closed"}),ctx())).status).toBe(200);
    expect(state.events[0].status).toBe("closed");
  });
  it("records only the actor's interest and scopes its list/removal to the event's room",async()=>{
    const {GET,POST,DELETE}=await import("@/app/api/rooms/[slug]/events/[id]/interest/route");
    expect((await POST(req("POST",{user_id:other}),ctx())).status).toBe(200);
    expect(state.interests).toContainEqual(expect.objectContaining({event_id:eventA,user_id:actor}));
    expect(await (await GET(req(),ctx())).json()).toEqual({interested:[{userId:actor,name:"Ana Silva",avatar:"a",title:""}],isInterested:true});
    expect((await DELETE(req("DELETE"),ctx("amigos",eventB))).status).toBe(404);
    expect((await POST(req("POST"),ctx("amigos",eventB))).status).toBe(404);
    expect((await DELETE(req("DELETE"),ctx())).status).toBe(200);
    expect(state.interests).toEqual([{event_id:eventB,user_id:other}]);
    state.events[0].status="closed";expect((await POST(req("POST"),ctx())).status).toBe(409);
    state.loggedIn=false;expect((await GET(req(),ctx())).status).toBe(401);
  });
});
