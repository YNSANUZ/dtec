import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  loggedIn: true, actor: "11111111-1111-4111-8111-111111111111",
  messages: [] as Record<string, unknown>[], reactions: [] as Record<string, unknown>[],
  staff: [] as Record<string, unknown>[], rpcFailure: false,
}));
const member = "22222222-2222-4222-8222-222222222222";
const idA = "33333333-3333-4333-8333-333333333333";
const idB = "44444444-4444-4444-8444-444444444444";

// External Supabase transport only: real handlers, validation and authorization run.
function client() {
  const profiles = [{ user_id: state.actor, display_name: "Ana Silva", avatar_id: "a" }, { user_id: member, display_name: "Beto Lima", avatar_id: "c" }];
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {}; let mode = "read"; let payload: Record<string, unknown> = {};
      const rows = () => table === "rooms" ? [{ slug: "amigos" }, { slug: "outra" }, { slug: "dtec" }]
        : table === "profiles" ? profiles : table === "room_staff" ? state.staff
        : table === "mural_messages" ? state.messages : state.reactions;
      const matches = (row: Record<string, unknown>) => Object.entries(filters).every(([k,v]) => Array.isArray(v) ? v.includes(row[k]) : row[k] === v);
      const execute = () => {
        let data = rows().filter(matches);
        if (mode === "insert") { data = [{ id: "55555555-5555-4555-8555-555555555555", is_pinned: false, created_at: "now", updated_at: "now", ...payload }]; state.messages.push(data[0]); }
        if (mode === "update") data.forEach((row) => Object.assign(row, payload));
        if (mode === "delete") state.messages = state.messages.filter((row) => !matches(row));
        return { data, error: null };
      };
      const query = {
        select() { return query; }, eq(k: string,v: unknown) { filters[k]=v; return query; },
        in(k: string,v: unknown[]) { filters[k]=v; return query; }, order() { return query; }, limit() { return query; },
        insert(v: Record<string,unknown>) { mode="insert";payload=v;return query; },
        update(v: Record<string,unknown>) { mode="update";payload=v;return query; }, delete() { mode="delete";return query; },
        async maybeSingle() { const r=execute();return { ...r,data:r.data[0]??null }; },
        async single() { const r=execute();return { ...r,data:r.data[0]??null }; },
        then(resolve: (v: unknown)=>unknown, reject?: (e: unknown)=>unknown) { return Promise.resolve(execute()).then(resolve,reject); },
      }; return query;
    },
    async rpc(name: string,args: Record<string,unknown>) {
      if (state.rpcFailure) return { data: null,error: { code: "XX000" } };
      const room = args.p_room_slug;
      const parent = state.messages.find((m)=>m.id===args.p_message_id&&m.room_slug===room);
      if (name === "toggle_room_mural_reaction") {
        if (!parent) return { data:null,error:{code:"P0002"} };
        const previous=state.reactions.find((r)=>r.message_id===parent.id&&r.user_id===state.actor);
        const next=previous?.reaction===args.p_reaction?null:args.p_reaction;
        state.reactions=state.reactions.filter((r)=>!(r.message_id===parent.id&&r.user_id===state.actor));
        if(next) state.reactions.push({message_id:parent.id,user_id:state.actor,reaction:next});
        return {data:next,error:null};
      }
      if (name === "clear_room_mural_reaction") { state.reactions=state.reactions.filter((r)=>!(r.message_id===parent?.id&&r.user_id===state.actor));return {data:true,error:null}; }
      const ids=args.p_message_ids as string[];
      return {data:state.messages.filter((m)=>m.room_slug===room&&ids.includes(String(m.id))).map((m)=>({message_id:m.id,
        like_count:state.reactions.filter((r)=>r.message_id===m.id&&r.reaction==="like").length,
        dislike_count:state.reactions.filter((r)=>r.message_id===m.id&&r.reaction==="dislike").length,
        my_reaction:state.reactions.find((r)=>r.message_id===m.id&&r.user_id===state.actor)?.reaction??null})),error:null};
    },
  };
}
vi.mock("@/lib/mural-server",()=>({getMuralUserContext:vi.fn(async()=>state.loggedIn?{supabase:client(),userId:state.actor,displayName:"Ana Silva"}:null)}));
const context=(slug="amigos",id=idA)=>({params:Promise.resolve({slug,id})});
const req=(method="GET",body?: unknown)=>new Request("https://cubo.test/api/rooms/amigos/mural?type=like",{method,...(body===undefined?{}:{headers:{"content-type":"application/json"},body:JSON.stringify(body)})});

describe("room mural API",()=>{
  beforeEach(()=>{
    state.loggedIn=true;state.rpcFailure=false;
    state.staff=[{room_slug:"amigos",user_id:state.actor,role:"owner"}];
    state.messages=[{id:idA,room_slug:"amigos",author_id:member,content:"Aviso A",is_pinned:false,created_at:"now",updated_at:"now"},
      {id:idB,room_slug:"outra",author_id:member,content:"Aviso B",is_pinned:false,created_at:"now",updated_at:"now"}];
    state.reactions=[{message_id:idA,user_id:member,reaction:"like"},{message_id:idB,user_id:state.actor,reaction:"like"}];
  });
  it("lists only the requested room and derives the new notice actor/room from session and route",async()=>{
    const {GET,POST}=await import("@/app/api/rooms/[slug]/mural/messages/route");
    const feed=await GET(req(),context());
    expect(feed.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await feed.json()).toMatchObject({messages:[{id:idA,content:"Aviso A",likeCount:1,myReaction:null}]});
    const created=await POST(req("POST",{content:" Novo ",room_slug:"outra",author_id:member}),context());
    expect(created.status).toBe(201);
    expect(state.messages.at(-1)).toMatchObject({content:"Novo",room_slug:"amigos",author_id:state.actor});
    const other=await GET(req(),context("outra"));
    expect(await other.json()).toMatchObject({messages:[{id:idB}]});
  });
  it("rejects anonymous access and nonexistent rooms",async()=>{
    const {GET,POST}=await import("@/app/api/rooms/[slug]/mural/messages/route");
    state.loggedIn=false;
    expect((await GET(req(),context())).status).toBe(401);
    expect((await POST(req("POST",{content:"Aviso"}),context())).status).toBe(401);
    state.loggedIn=true;
    expect((await GET(req(),context("ausente"))).status).toBe(404);
  });
  it("returns 404 for a foreign ID and allows ADM pinning only its room",async()=>{
    const {PATCH,DELETE}=await import("@/app/api/rooms/[slug]/mural/messages/[id]/route");
    expect((await PATCH(req("PATCH",{content:"Vazou"}),context("amigos",idB))).status).toBe(404);
    expect((await DELETE(req("DELETE"),context("amigos",idB))).status).toBe(404);
    expect((await PATCH(req("PATCH",{isPinned:true}),context())).status).toBe(200);
    expect(state.messages[0].is_pinned).toBe(true);
    expect((await PATCH(req("PATCH",{content:"Invadido"}),context("outra",idB))).status).toBe(403);
    expect(state.messages[1].content).toBe("Aviso B");
    state.staff=[];state.messages[0].author_id=state.actor;state.messages[0].is_pinned=false;
    expect((await PATCH(req("PATCH",{content:"Meu recado"}),context())).status).toBe(200);
    expect((await PATCH(req("PATCH",{isPinned:true}),context())).status).toBe(403);
  });
  it("keeps reaction people and mutations tied to the parent room and reports RPC failure",async()=>{
    const {GET,PUT,DELETE}=await import("@/app/api/rooms/[slug]/mural/messages/[id]/reactions/route");
    expect(await (await GET(req(),context())).json()).toEqual({people:[{userId:member,name:"Beto Lima",avatar:"c"}],count:1});
    expect((await GET(req(),context("amigos",idB))).status).toBe(404);
    expect((await PUT(req("PUT",{reaction:"like"}),context("amigos",idB))).status).toBe(404);
    expect((await DELETE(req("DELETE"),context("amigos",idB))).status).toBe(404);
    expect(await (await PUT(req("PUT",{reaction:"like"}),context())).json()).toMatchObject({likeCount:2,myReaction:"like"});
    expect(await (await DELETE(req("DELETE"),context())).json()).toMatchObject({likeCount:1,myReaction:null});
    state.rpcFailure=true;
    expect((await PUT(req("PUT",{reaction:"like"}),context())).status).toBe(500);
    state.loggedIn=false;
    expect((await GET(req(),context())).status).toBe(401);
  });
});
