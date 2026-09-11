import test from "node:test";
import assert from "node:assert/strict";
import { photoAssetForSrc, photoCaptionForSrc } from "../src/lib/photo-assets.mjs";

const genericCaption = "Photo selected from the Seahawks Fan Zone photo collection; illustrative image.";

test("generated news copies retain their verified Getty asset credit", () => {
  const cases = [
    ["/images/news/generated/ec0c786154d7a3e18a6d5421a7e6e62fb688b73a1f8014d57314e3776095355f.jpg", "2260601545", "Drake Maye is sacked during Super Bowl LX on February 8, 2026. File photo. Photo by Kevin C. Cox/Getty Images"],
    ["/images/news/generated/466d6047731b24335c4be1c1a504106f2cfa45d5db46bf11091e74e736565661.jpg", "2260614489", "Jaxon Smith-Njigba celebrates after Super Bowl LX on February 8, 2026. File photo. Photo by Thearon W. Henderson/Getty Images"],
  ];

  for (const [src, gettyAssetId, caption] of cases) {
    assert.equal(photoAssetForSrc(`${src}?optimized=1`)?.gettyAssetId, gettyAssetId);
    assert.equal(photoCaptionForSrc(src, genericCaption), caption);
  }
});

test("the obsolete collection caption is suppressed without hiding meaningful fallbacks", () => {
  assert.equal(photoCaptionForSrc("/images/unmatched.jpg", genericCaption), null);
  assert.equal(photoCaptionForSrc("/images/unmatched.jpg", "A meaningful descriptive caption."), "A meaningful descriptive caption.");
});
