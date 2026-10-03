// @vitest-environment happy-dom
import React from "react";
import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import GenericRoom from "@/components/generic-room";
import DtecRoom from "@/app/dtec/page";
const state=vi.hoisted(()=>({active:false,mode:"public",pending:false,created:false,role:"visitor"}));
const account={id:"ana"};
vi.mock("@/hooks/use-dtec-auth",()=>({useDtecAuth:()=>({state:"ready",user:account,profile:{displayName:"Ana Silva",avatarId:"a"}})}));
vi.mock("@/components/avatar-preview",()=>({default:()=> <span>Avatar</span>}));
vi.mock("next/dynamic",()=>({default:()=>function Scene(props:{created:boolean;role:string;onMuralClick:(id:string)=>void}){state.created=props.created;state.role=props.role;return <button onClick={()=>props.onMuralClick("informacoes")}>Abrir painel 3D</button>;}}));
const transport=vi.fn();
beforeEach(()=>{
  state.active=false;state.pending=false;state.mode="public";state.created=false;state.role="visitor";
  transport.mockReset();vi.stubGlobal("fetch",transport);
  transport.mockImplementation((url:string,init?:RequestInit)=>{
    if(url.endsWith("/membership")){
      if(init?.method==="POST"){if(state.mode==="protected")state.pending=true;else state.active=true;}
      return Promise.resolve(Response.json({status:state.active?"active":state.pending?"pending":"visitor",role:state.active?"member":"visitor",entryMode:state.mode}));
    }
    return Promise.resolve(Response.json(url.endsWith("/identity")?{title:"Amigos",description:"Grupo da equipe"}:url.endsWith("/boards")?{nodes:[],canManage:false}:url.endsWith("/presence")||url.endsWith("/characters")?{users:[{userId:"ana",name:"Ana Silva",avatar:"a",x:7,z:2,online:state.active,birthdayToday:false}]}:{messages:[]}));
  });
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
it.each(["generic","dtec"])("keeps a logged nonmember outside panels and presence until explicit public admission in %s",async kind=>{
  render(kind==="dtec"?<DtecRoom/>:<GenericRoom room={{slug:"amigos",title:"Amigos",description:""}}/>);
  await screen.findByRole("button",{name:"Participar do grupo"});
  expect(state.role).toBe("visitor");expect(state.created).toBe(false);
  expect(transport.mock.calls.some(([url,init])=>url.endsWith("/boards")||init?.method==="POST")).toBe(false);
  fireEvent.click(screen.getByRole("button",{name:kind==="dtec"?"Abrir painel 3D":"Quadro de avisos"}));
  expect(await screen.findByText(/Você não tem permissão para abrir este painel/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"Fechar painel"}));
  fireEvent.click(screen.getByRole("button",{name:"Participar do grupo"}));
  fireEvent.click(screen.getByRole("button",{name:"Participar agora"}));
  const slug=kind==="dtec"?"dtec":"amigos";
  await waitFor(()=>expect(transport).toHaveBeenCalledWith(`/api/rooms/${slug}/boards`,expect.objectContaining({cache:"no-store"})));
  await waitFor(()=>expect(state.created).toBe(true));expect(state.role).toBe("member");
  expect(transport.mock.calls.some(([url,init])=>url.endsWith("/presence")&&init?.method==="POST")).toBe(true);
});
it("shows pending approval without unlocking panels or publishing presence",async()=>{
  state.mode="protected";
  render(<GenericRoom room={{slug:"amigos",title:"Amigos",description:""}}/>);
  fireEvent.click(await screen.findByRole("button",{name:"Participar do grupo"}));
  expect(screen.getByRole("button",{name:"Entrar com token"}).hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByRole("button",{name:"Solicitar entrada"}));
  expect(await screen.findByText(/Solicitação enviada/)).toBeTruthy();
  await act(async()=>{});
  expect(state.role).toBe("visitor");expect(state.created).toBe(false);
  expect(transport.mock.calls.some(([url,init])=>url.endsWith("/boards")||(url.endsWith("/presence")&&init?.method==="POST"))).toBe(false);
});
