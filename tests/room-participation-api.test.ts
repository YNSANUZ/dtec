import { beforeEach, expect, it, vi } from "vitest";
type Row=Record<string,unknown>;
const state=vi.hoisted(()=>({authenticated:true,rows:{} as Record<string,Row[]>,calls:[] as string[],photoCalls:[] as string[][],errorTable:"",photoError:false}));
function client(){return {
  from(table:string){state.calls.push(table);const filters:Array<(r:Row)=>boolean>=[];const orders:string[]=[];let start=0,end=99;
    const run=()=>{const data=(state.rows[table]??[]).filter(r=>filters.every(f=>f(r))).sort((a,b)=>orders.map(k=>String(a[k]).localeCompare(String(b[k]))).find(v=>v!==0)??0);return {data:data.slice(start,Math.min(end+1,start+100)),error:state.errorTable===table?{code:"failed"}:null};};
    const q={select(){return q;},eq(k:string,v:unknown){filters.push(r=>r[k]===v);return q;},in(k:string,v:unknown[]){filters.push(r=>v.includes(r[k]));return q;},order(k:string){orders.push(k);return q;},range(a:number,b:number){start=a;end=b;return q;},async maybeSingle(){const r=run();return {...r,data:r.data[0]??null};},then(resolve:(r:unknown)=>unknown,reject?:(e:unknown)=>unknown){return Promise.resolve(run()).then(resolve,reject);}};return q;
  },async rpc(name:string,args:{p_user_ids:string[]}){if(name!=="room_google_photos")throw new Error("Unexpected write/RPC");state.photoCalls.push(args.p_user_ids);return {data:args.p_user_ids.map(user_id=>({user_id,photo_url:`https://lh3.googleusercontent.com/${user_id}`})),error:state.photoError?{code:"failed"}:null};}
};}
vi.mock("@/lib/mural-server",()=>({getMuralUserContext:vi.fn(async()=>state.authenticated?{supabase:client(),userId:"ana",displayName:"Ana Silva"}:null)}));
const ctx=(slug="amigos")=>({params:Promise.resolve({slug})});
const request=(section?:string)=>new Request(`https://test/api/rooms/amigos/participation${section===undefined?"":`?section=${section}`}`);
type Body={sections:Record<string,{count:number;photos:Array<{photoUrl:string|null}>}>;people:Array<{userId:string;name:string;title:string;avatar:string;photoUrl:string|null}>};
beforeEach(()=>{state.authenticated=true;state.calls=[];state.photoCalls=[];state.errorTable="";state.photoError=false;state.rows={rooms:[{slug:"amigos"},{slug:"outra"}],mural_messages:[{id:"m1",room_slug:"amigos",author_id:"ana"},{id:"m2",room_slug:"outra",author_id:"foreign"}],mural_message_reactions:[{message_id:"m1",user_id:"beto"},{message_id:"m1",user_id:"ana"},{message_id:"m2",user_id:"foreign"}],room_events:[{id:"e1",room_slug:"amigos",status:"open"},{id:"e2",room_slug:"outra",status:"open"},{id:"e3",room_slug:"amigos",status:"closed"}],room_event_interests:[{event_id:"e1",user_id:"ana"},{event_id:"e1",user_id:"ana"},{event_id:"e2",user_id:"foreign"},{event_id:"e3",user_id:"beto"}],fundraisers:[{id:"f1",room_slug:"amigos",status:"open"},{id:"f2",room_slug:"outra",status:"open"},{id:"f3",room_slug:"amigos",status:"closed"}],fundraiser_participants:[{fundraiser_id:"f1",user_id:"ana",active:true},{fundraiser_id:"f1",user_id:"beto",active:false},{fundraiser_id:"f2",user_id:"foreign",active:true},{fundraiser_id:"f3",user_id:"beto",active:true}],profiles:[{user_id:"ana",display_name:"Ana Silva",title:"Dev",avatar_id:"a",email:"private",whatsapp:"private"},{user_id:"beto",display_name:"Beto Lima",title:"",avatar_id:"c"},{user_id:"foreign",display_name:"Pessoa de outra sala",title:"",avatar_id:"r"}]};});
it("counts unique people from this room's resources, only open/active, hiding names in previews",async()=>{
  const {GET}=await import("@/app/api/rooms/[slug]/participation/route");const r=await GET(request(),ctx());const b=await r.json() as Body;
  expect(r.status).toBe(200);expect(r.headers.get("Cache-Control")).toBe("private, no-store");
  expect(b.sections.notices.count).toBe(2);expect(b.sections.events.count).toBe(1);expect(b.sections.fundraisers.count).toBe(1);
  expect(state.photoCalls.flat()).not.toContain("foreign");expect(JSON.stringify(b)).not.toMatch(/Ana Silva|private|totalCollected/);
});
it("returns a selected roster with names and heads but no contacts or financial data",async()=>{
  const {GET}=await import("@/app/api/rooms/[slug]/participation/route");const b=await (await GET(request("notices"),ctx())).json() as Body;
  expect(b.people.map(p=>p.name)).toEqual(["Ana Silva","Beto Lima"]);expect(b.people[0]).toEqual({userId:"ana",name:"Ana Silva",title:"Dev",avatar:"a",photoUrl:"https://lh3.googleusercontent.com/ana"});
  expect(state.calls).not.toContain("fundraisers");expect(state.calls).not.toContain("fundraiser_contributions");
});
it("blocks visitors, invalid sections/rooms and uses no photo RPC without people",async()=>{
  const {GET}=await import("@/app/api/rooms/[slug]/participation/route");state.authenticated=false;expect((await GET(request(),ctx())).status).toBe(401);expect(state.calls).toEqual([]);
  state.authenticated=true;expect((await GET(request("unknown"),ctx())).status).toBe(400);expect((await GET(request(),ctx("missing"))).status).toBe(404);
  state.rows.mural_messages=[];state.rows.room_events=[];state.rows.fundraisers=[];
  const b=await (await GET(request(),ctx())).json() as Body;expect(b.sections.notices).toEqual({count:0,photos:[]});expect(state.photoCalls).toEqual([]);
});
it("paginates 205 members and resources while limiting the overview to six photos per section",async()=>{
  const people=Array.from({length:205},(_,i)=>`person${String(i).padStart(3,"0")}`);
  state.rows.mural_messages=people.map((user_id,i)=>({id:`m${i}`,room_slug:"amigos",author_id:user_id}));state.rows.profiles=people.map(user_id=>({user_id,display_name:user_id,title:"",avatar_id:"a"}));state.rows.mural_message_reactions=[];
  const {GET}=await import("@/app/api/rooms/[slug]/participation/route");const b=await (await GET(request(),ctx())).json() as Body;
  expect(b.sections.notices.count).toBe(205);expect(b.sections.notices.photos).toHaveLength(6);expect(state.photoCalls.flat()).toHaveLength(6);
  state.photoCalls=[];const detail=await (await GET(request("notices"),ctx())).json() as Body;expect(detail.people).toHaveLength(205);expect(state.photoCalls.map(c=>c.length)).toEqual([200,5]);
});
it("keeps counts when photos fail but does not pretend database failure is an empty section",async()=>{
  const {GET}=await import("@/app/api/rooms/[slug]/participation/route");state.photoError=true;const b=await (await GET(request(),ctx())).json() as Body;expect(b.sections.notices.photos).toEqual([{photoUrl:null},{photoUrl:null}]);
  state.errorTable="mural_message_reactions";expect((await GET(request(),ctx())).status).toBe(500);
});
