export type HistoryEntry={id:string;at:string;name:string;text:string};
export type HistoryPage={entries:HistoryEntry[];nextCursor:string|null};
export function readHistoryPage(input:unknown):HistoryPage{
  if(!input||typeof input!=="object")throw new Error("invalid_history");
  const body=input as HistoryPage;
  if(!Array.isArray(body.entries)||body.entries.some(entry=>!entry||["id","at","name","text"].some(key=>typeof (entry as unknown as Record<string,unknown>)[key]!=="string"))||!(body.nextCursor===null||typeof body.nextCursor==="string"))throw new Error("invalid_history");
  return body;
}
