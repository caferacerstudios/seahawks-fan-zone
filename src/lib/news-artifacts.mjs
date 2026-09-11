// Shared data contract for the Airflow news importer and Astro's news collection.
export const NEWS_SNAPSHOT_VERSION = 1;
export const GENERATED_IMAGE = /^\/images\/news\/generated\/([a-f0-9]{64}\.(?:jpg|png|webp))$/;
const categories = new Set(['News', 'Analysis', 'Contract Strategy', 'Roster', 'Injuries', 'Game Week', 'Hard Knocks', 'NFC West']);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max = 10000) => typeof value === 'string' && value.trim() && value.length <= max && !/[\x00-\x08\x0b\x0c\x0e-\x1f<>]/.test(value);
const timestamp = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const decodeAttribute = (value) => value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>');

function validSource(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password &&
      /^(?:[a-z0-9-]+\.)*(?:seahawks|nfl)\.com$/.test(parsed.hostname);
  } catch { return false; }
}

function validateParagraph(value, sources) {
  if (typeof value !== 'string' || !value.trim() || value.length > 15000) throw new Error('Invalid generated paragraph');
  let open = false;
  let citations = 0;
  for (const part of value.split(/(<[^>]*>)/g)) {
    if (part === '</a>') {
      if (!open) throw new Error('Invalid news citation closing tag');
      open = false;
    } else if (part.startsWith('<')) {
      const match = /^<a href="([^"<>]+)">$/.exec(part);
      if (!match || open || !sources.has(decodeAttribute(match[1]))) throw new Error('Unsafe or unsupported generated HTML');
      open = true;
      citations++;
    } else if (/[<>]/.test(part)) {
      throw new Error('Unescaped generated HTML');
    }
  }
  if (open || !citations) throw new Error('Generated paragraph needs a completed source citation');
}

export function validateGeneratedCollection(document) {
  if (!object(document) || document.schema_version !== NEWS_SNAPSHOT_VERSION || !Array.isArray(document.articles)) throw new Error('Invalid generated news collection');
  const slugs = new Set();
  const days = new Set();
  for (const a of document.articles) {
    const fail = () => { throw new Error(`Invalid generated article: ${a?.slug ?? 'unknown'}`); };
    if (!object(a) || typeof a.slug !== 'string' || !/^daily-seahawks-\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(a.slug) || a.slug.length > 140 || slugs.has(a.slug)) fail();
    if (!text(a.headline, 180) || !text(a.dek, 360) || !text(a.author, 160) || !categories.has(a.category) || !['draft', 'published', 'archived'].includes(a.status) || typeof a.featured !== 'boolean') fail();
    if (!timestamp(a.publishedAt) || !timestamp(a.updatedAt) || Date.parse(a.updatedAt) < Date.parse(a.publishedAt)) fail();
    if (!Array.isArray(a.tags) || !a.tags.length || a.tags.some(t => !text(t, 60)) || !(a.season === null || Number.isInteger(a.season)) || !(a.opponent === null || text(a.opponent, 160))) fail();
    const g = a.generation;
    if (!object(g) || g.kind !== 'ai' || !/^\d{4}-\d{2}-\d{2}$/.test(g.publicationDay ?? '') || !Number.isFinite(Date.parse(g.publicationDay)) || !a.slug.startsWith(`daily-seahawks-${g.publicationDay}-`) || days.has(g.publicationDay) || !text(g.model, 100)) fail();
    if (!Array.isArray(a.sources) || a.sources.length < 2 || a.sources.some(s => !object(s) || !text(s.label, 500) || !validSource(s.url))) fail();
    const sources = new Set(a.sources.map(s => s.url));
    if (sources.size < 2 || !Array.isArray(a.body) || !a.body.length) fail();
    for (const block of a.body) {
      if (!object(block)) fail();
      if (block.type === 'heading') { if (!text(block.heading, 150)) fail(); }
      else if (block.type === 'paragraph') validateParagraph(block.html, sources);
      else fail();
    }
    const h = a.hero;
    if (!object(h) || !text(h.alt, 1000) || !Number.isInteger(h.width) || h.width < 1 || h.width > 30000 || !Number.isInteger(h.height) || h.height < 1 || h.height > 30000 || !text(h.caption, 2000)) fail();
    if (h.src !== '/images/news/newsroom-field.svg' && !GENERATED_IMAGE.test(h.src)) fail();
    slugs.add(a.slug);
    days.add(g.publicationDay);
  }
  return document;
}

export function mergePublishedArticles(authored, generated, now = Date.now()) {
  const combined = [...authored, ...generated];
  const slugs = new Set();
  for (const article of combined) {
    if (slugs.has(article.slug)) throw new Error(`Authored/generated news slug collision: ${article.slug}`);
    slugs.add(article.slug);
  }
  return combined.filter(a => a.status === 'published' && Number.isFinite(Date.parse(a.publishedAt)) && Date.parse(a.publishedAt) <= now)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}
