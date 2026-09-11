import photoAssetData from "../data/photo-assets.json" with { type: "json" };

export const photoAssets = Object.freeze(photoAssetData.assets);

export function photoAssetForSrc(src) {
  if (typeof src !== "string" || !src) return null;
  const pathname = src.split(/[?#]/, 1)[0];
  return photoAssets.find((asset) => asset.src === pathname) ?? null;
}

export function photoCaptionForSrc(src, fallback = null) {
  const asset = photoAssetForSrc(src);
  return asset ? `${asset.caption} ${asset.credit}` : fallback;
}
