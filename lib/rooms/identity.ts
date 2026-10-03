export type RoomIdentity={title:string;description:string};
export function roomIdentity(input:unknown):RoomIdentity{
  if(!input||typeof input!=="object")throw new Error("invalid_identity");
  const data=input as Record<string,unknown>;
  if(typeof data.title!=="string"||typeof data.description!=="string")throw new Error("invalid_identity");
  const title=data.title.trim(),description=data.description.trim();
  if(title.length<3||title.length>60||description.length>280)throw new Error("invalid_identity");
  return {title,description};
}
