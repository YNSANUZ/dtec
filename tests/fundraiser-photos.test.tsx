// @vitest-environment happy-dom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FundraisersFolder } from "@/components/mural/fundraisers-folder";
vi.mock("@/components/avatar-preview",()=>({default:({model}:{model:string})=><span aria-label={`Cabeça ${model}`} />}));
const transport=vi.fn();
const person=(index:number)=>({userId:`u${index}`,name:`Pessoa ${index}`,avatar:"a",title:"",markedAt:null});
const campaign={id:"camp",title:"Vaquinha teste",description:"Descrição de teste",monthlyAmountCents:2500,dueDay:10,pixKey:"Pix fictício",paymentInstructions:"Não transferir",currentCycleDueDate:"2026-10-10",isParticipant:false,paid:[person(0)],pending:Array.from({length:7},(_,i)=>person(i+1)),photos:Array.from({length:6},()=>({photoUrl:"https://lh3.googleusercontent.com/photo"}))};
const reply=(body:unknown)=>Promise.resolve(new Response(JSON.stringify(body)));
beforeEach(()=>{transport.mockReset();vi.stubGlobal("fetch",transport);transport.mockImplementation(()=>reply({fundraisers:[campaign]}));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("shows six Google circles and +2, and opens paid/pending heads without nested buttons or writing",async()=>{
  const view=render(<FundraisersFolder currentUserId="u0" isAdminOrMod={false} roomSlug="amigos" />);
  const stack=await screen.findByRole("button",{name:"Ver 8 pessoas em Vaquinha teste"});
  expect(stack.querySelectorAll("img")).toHaveLength(6);expect(stack.textContent).toContain("+2");
  expect(view.container.querySelector("button button")).toBeNull();fireEvent.click(stack);
  expect(screen.getByText("Descrição de teste")).toBeTruthy();expect(screen.getByText("Pix fictício")).toBeTruthy();
  expect(view.container.querySelectorAll(".contribution-paid article")).toHaveLength(1);
  expect(view.container.querySelectorAll(".contribution-pending article.pending")).toHaveLength(7);
  expect(screen.getAllByLabelText("Cabeça a")).toHaveLength(8);
  expect(screen.getByRole("button",{name:"Estou interessado"})).toBeTruthy();expect(screen.queryByText(/total arrecadado/i)).toBeNull();
  expect(transport.mock.calls.every(([,options])=>!options.method)).toBe(true);
});
it("uses placeholders and no count when empty, including the DTEC alias",async()=>{
  transport.mockImplementation(()=>reply({fundraisers:[{...campaign,photos:[{photoUrl:null}],paid:[],pending:[person(1)]}]}));
  const view=render(<FundraisersFolder currentUserId="u0" isAdminOrMod={false} />);
  const stack=await screen.findByRole("button",{name:"Ver 1 pessoa em Vaquinha teste"});expect(stack.querySelector("img")).toBeNull();
  expect(transport).toHaveBeenCalledWith("/api/fundraisers",{cache:"no-store"});
  transport.mockImplementation(()=>reply({fundraisers:[{...campaign,photos:[],paid:[],pending:[]}]}));
  view.rerender(<FundraisersFolder currentUserId="u0" isAdminOrMod={false} roomSlug="vazia" />);
  await screen.findByRole("button",{name:/Vaquinha teste.*25/});expect(screen.queryByRole("button",{name:/Ver .*pessoas? em/})).toBeNull();
});
it("clears photos immediately for a new room/account/logout and ignores a late response",async()=>{
  let resolveOld!: (response:Response)=>void;
  transport.mockImplementation((url:string)=>url.includes("/outra/")?new Promise(resolve=>{resolveOld=resolve;}):reply({fundraisers:[campaign]}));
  const view=render(<FundraisersFolder currentUserId="u0" isAdminOrMod={false} roomSlug="amigos" />);
  await screen.findByRole("button",{name:"Ver 8 pessoas em Vaquinha teste"});
  view.rerender(<FundraisersFolder currentUserId="u0" isAdminOrMod={false} roomSlug="outra" />);
  expect(screen.queryByRole("button",{name:"Ver 8 pessoas em Vaquinha teste"})).toBeNull();
  transport.mockImplementation(()=>reply({fundraisers:[{...campaign,title:"Nova conta"}]}));
  view.rerender(<FundraisersFolder currentUserId="u1" isAdminOrMod={false} roomSlug="outra" />);
  await screen.findByRole("button",{name:"Ver 8 pessoas em Nova conta"});
  resolveOld(new Response(JSON.stringify({fundraisers:[campaign]})));
  await waitFor(()=>expect(screen.queryByRole("button",{name:"Ver 8 pessoas em Vaquinha teste"})).toBeNull());
  transport.mockClear();view.rerender(<FundraisersFolder currentUserId={null} isAdminOrMod={false} roomSlug="outra" />);
  expect(screen.queryByRole("button",{name:"Ver 8 pessoas em Nova conta"})).toBeNull();expect(transport).not.toHaveBeenCalled();
});
