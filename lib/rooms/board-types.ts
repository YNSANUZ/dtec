import { z } from "zod";

export type BoardNode = { id: string; parentId: string | null; title: string; kind: "panel" | "folder"; contentKind: "notes" | "events" | "fundraisers" | "birthdays" | null; order: number; legacyKey: string | null };
export type ScenePanel = { id: string; title: string; rows: string[] };
export const boardNodeInput = z.object({
  title: z.string().trim().min(1).max(60), parentId: z.string().uuid().nullable().default(null),
  kind: z.enum(["panel", "folder"]), contentKind: z.enum(["notes", "events", "fundraisers", "birthdays"]).nullable().default(null),
  order: z.number().int().min(0).max(999).default(0),
}).strip().refine(n => n.kind === "panel" ? n.parentId === null && n.contentKind === null : n.parentId !== null);
export const boardNodePatch = z.object({ title: z.string().trim().min(1).max(60).optional(), parentId: z.string().uuid().optional(), order: z.number().int().min(0).max(999).optional() }).strip().refine(n => Object.keys(n).length > 0);
export function boardPath(nodes: BoardNode[], id: string | null) {
  const path: BoardNode[] = [], seen = new Set<string>();
  while (id) {
    if (seen.has(id)) break;
    seen.add(id);
    const node = nodes.find(n => n.id === id);
    if (!node) break;
    path.unshift(node); id = node.parentId;
  }
  return path;
}
export function scenePanels(nodes: BoardNode[]): ScenePanel[] {
  return nodes.filter(n => n.kind === "panel").sort((a,b) => a.order-b.order).map(n => ({ id: n.id, title: n.title, rows: nodes.filter(c => c.parentId === n.id).sort((a,b) => a.order-b.order).slice(0,4).map(c => c.title) }));
}
