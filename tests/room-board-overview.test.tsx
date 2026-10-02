// @vitest-environment happy-dom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RoomBoard } from "@/components/rooms/room-board";
vi.mock("@/components/avatar-preview",()=>({default:()=><span aria-label="Cabeça do personagem" />}));
const transport=vi.fn();const reply=(body:unknown)=>Promise.resolve(new Response(JSON.stringify(body)));
const summary={sections:{notices:{count:8,photos:Array.from({length:6},()=>({photoUrl:"https://lh3.googleusercontent.com/person"}))},events:{count:0,photos:[]},fundraisers:{count:1,photos:[{photoUrl:null}]}}};
beforeEach(()=>{transport.mockReset();vi.stubGlobal("fetch",transport);transport.mockImplementation((url:string)=>reply(url.endsWith("/staff")?{canManage:false}:url.includes("?section=")?{people:[{userId:"ana",name:"Ana Silva",avatar:"a",title:"Dev"}]}:url.endsWith("/participation")?summary:{messages:[]}));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("opens an overview with six/+N, photos open names and heads while section buttons navigate without writes",async()=>{
  const view=render(<RoomBoard roomSlug="amigos" currentUserId="ana" onClose={()=>{}} />);
  expect(screen.getByRole("button",{name:"Visão geral"}).getAttribute("aria-pressed")).toBe("true");
  const stack=await screen.findByRole("button",{name:"Ver 8 pessoas em Recados"});expect(stack.textContent).toContain("+2");expect(stack.querySelectorAll("img")).toHaveLength(6);expect(screen.queryByText("Ana Silva")).toBeNull();
  expect(view.container.querySelector("button button")).toBeNull();fireEvent.click(stack);expect(await screen.findByText("Ana Silva")).toBeTruthy();expect(screen.getByLabelText("Cabeça do personagem")).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"Fechar participantes"}));fireEvent.click(screen.getByRole("button",{name:"Abrir Recados"}));expect(await screen.findByLabelText("Novo recado")).toBeTruthy();
  expect(transport.mock.calls.every(([,o])=>!o.method)).toBe(true);
});
it("clears summaries/rosters on room/account changes or logout and ignores late details",async()=>{
  let resolveOld!:(r:Response)=>void;
  transport.mockImplementation((url:string)=>url.includes("?section=")?new Promise(resolve=>{resolveOld=resolve;}):reply(url.endsWith("/staff")?{canManage:false}:url.includes("/outra/")?{sections:{notices:{count:1,photos:[{photoUrl:null}]}}}:summary));
  const view=render(<RoomBoard roomSlug="amigos" currentUserId="ana" onClose={()=>{}} />);fireEvent.click(await screen.findByRole("button",{name:"Ver 8 pessoas em Recados"}));
  view.rerender(<RoomBoard roomSlug="outra" currentUserId="ana" onClose={()=>{}} />);expect(screen.queryByRole("button",{name:"Ver 8 pessoas em Recados"})).toBeNull();resolveOld(new Response(JSON.stringify({people:[{userId:"ana",name:"Ana Silva",avatar:"a"}]})));
  await screen.findByRole("button",{name:"Ver 1 pessoa em Recados"});expect(screen.queryByText("Ana Silva")).toBeNull();
  transport.mockImplementation((url:string)=>reply(url.endsWith("/staff")?{canManage:false}:{sections:{}}));view.rerender(<RoomBoard roomSlug="outra" currentUserId="beto" onClose={()=>{}} />);expect(screen.queryByRole("button",{name:"Ver 1 pessoa em Recados"})).toBeNull();
  await waitFor(()=>expect(screen.getByRole("button",{name:"Abrir Recados"})).toBeTruthy());transport.mockClear();view.rerender(<RoomBoard roomSlug="outra" currentUserId={null} onClose={()=>{}} />);expect(transport).not.toHaveBeenCalled();expect(screen.queryByRole("button",{name:"Visão geral"})).toBeNull();
});
it("closing participants ignores a late response",async()=>{
  let resolveOld!:(r:Response)=>void;transport.mockImplementation((url:string)=>url.includes("?section=")?new Promise(resolve=>{resolveOld=resolve;}):reply(url.endsWith("/staff")?{canManage:false}:summary));
  render(<RoomBoard roomSlug="amigos" currentUserId="ana" onClose={()=>{}} />);fireEvent.click(await screen.findByRole("button",{name:"Ver 8 pessoas em Recados"}));fireEvent.click(screen.getByRole("button",{name:"Fechar participantes"}));resolveOld(new Response(JSON.stringify({people:[{userId:"ana",name:"Ana Silva"}]})));await waitFor(()=>expect(screen.queryByText("Ana Silva")).toBeNull());
});
it("failed summaries retain navigation and do not invent people",async()=>{
  transport.mockImplementation((url:string)=>url.endsWith("/staff")?reply({canManage:false}):Promise.resolve(new Response("{}",{status:500})));
  render(<RoomBoard roomSlug="amigos" currentUserId="ana" onClose={()=>{}} />);expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.getByRole("button",{name:"Abrir Vaquinhas"})).toBeTruthy();expect(screen.queryByRole("button",{name:/Ver .*pessoas? em/})).toBeNull();
});
it("StrictMode ignores the first summary after its effect is cleaned up",async()=>{
  const pending:Array<(r:Response)=>void>=[];transport.mockImplementation((url:string)=>url.endsWith("/staff")?reply({canManage:false}):new Promise(resolve=>{pending.push(resolve);}));
  render(<React.StrictMode><RoomBoard roomSlug="amigos" currentUserId="ana" onClose={()=>{}} /></React.StrictMode>);
  expect(pending).toHaveLength(2);pending[1](new Response(JSON.stringify({sections:{notices:{count:1,photos:[{photoUrl:null}]}}})));
  await screen.findByRole("button",{name:"Ver 1 pessoa em Recados"});pending[0](new Response(JSON.stringify(summary)));
  await waitFor(()=>expect(screen.queryByRole("button",{name:"Ver 8 pessoas em Recados"})).toBeNull());
});
