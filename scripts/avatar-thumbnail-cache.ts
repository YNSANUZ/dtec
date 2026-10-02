import { thumbnailModel, type ThumbnailModel } from "../lib/avatar-thumbnail";
export { thumbnailModel, thumbnailModels } from "../lib/avatar-thumbnail";

// Offline asset generation only: at most twelve variants, without overlapping WebGL contexts.
export function createThumbnailCache(render: (model: ThumbnailModel, headOnly: boolean) => Promise<string>) {
  const images = new Map<string, Promise<string>>();
  let queue: Promise<unknown> = Promise.resolve();
  return (input: string, headOnly: boolean) => {
    const model = thumbnailModel(input);
    const key = `${model}:${headOnly ? "head" : "body"}`;
    const cached = images.get(key);
    if (cached) return cached;
    const result = queue.then(() => render(model, headOnly));
    images.set(key, result);
    queue = result.catch(() => { images.delete(key); });
    return result;
  };
}

export const getAvatarThumbnail = createThumbnailCache(async (model, headOnly) => {
  const { renderAvatarThumbnail } = await import("./avatar-thumbnail-render");
  return renderAvatarThumbnail(model, headOnly);
});
