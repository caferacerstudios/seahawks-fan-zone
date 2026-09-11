import photoAssetData from "../data/photo-assets.json" with { type: "json" };

export const photoAssets = Object.freeze(photoAssetData.assets);
export const OBSOLETE_PHOTO_CAPTIONS = Object.freeze([
  "Photo selected from the Seahawks Fan Zone photo collection; illustrative image.",
]);

export function photoAssetForSrc(src) {
  if (typeof src !== "string" || !src) return null;
  const pathname = src.split(/[?#]/, 1)[0];
  return photoAssets.find((asset) => asset.src === pathname || asset.aliases?.includes(pathname)) ?? null;
}

export function photoCaptionForSrc(src, fallback = null) {
  const asset = photoAssetForSrc(src);
  if (asset) return `${asset.caption} ${asset.credit}`;
  return OBSOLETE_PHOTO_CAPTIONS.includes(fallback?.trim()) ? null : fallback;
}
