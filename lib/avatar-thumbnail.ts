export const thumbnailModels = ["a", "c", "f", "j", "n", "r"] as const;
export type ThumbnailModel = (typeof thumbnailModels)[number];
export const thumbnailModel = (model: string): ThumbnailModel => thumbnailModels.includes(model as ThumbnailModel) ? model as ThumbnailModel : "r";
export const avatarThumbnailUrl = (model: string, headOnly: boolean) => `/avatars/character-${thumbnailModel(model)}-${headOnly ? "head" : "body"}.png`;
