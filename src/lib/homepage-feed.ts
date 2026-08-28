import type { NewsArticle } from "./news";
import { materiallyUpdated } from "./news";
import type { CuratedLink } from "../data/around-the-web";

export const DEFAULT_HOMEPAGE_FRESHNESS_DAYS = 14;
const DAY = 86_400_000;

export type HomepageStory = {
  id: string; headline: string; summary: string; href: string; category: string;
  date: string; dateLabel: "Published" | "Updated"; byline: string;
  external: boolean; readMinutes: number | null; editorialLabel: "Editor's pick" | null;
  image: NewsArticle["hero"] | null; rank: number;
};

const timestamp = (value: string) => Date.parse(value);
const recent = (value: string, now: Date, days: number) => {
  const age = now.getTime() - timestamp(value);
  return Number.isFinite(age) && age >= 0 && age <= days * DAY;
};
const readingTime = (article: NewsArticle) => {
  const words = article.body.map((block) => {
    if (typeof block === "string") return block;
    if (block.type === "heading") return block.heading;
    if (block.type === "paragraph") return block.html;
    if (block.type === "factbox") return [block.heading, ...block.known, ...block.unknown, block.milestone].join(" ");
    return block.items.flatMap((item) => [item.label, item.html]).join(" ");
  }).join(" ").replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;
  return words ? Math.max(1, Math.ceil(words / 225)) : null;
};

export function selectHomepageStories(articles: NewsArticle[], curated: CuratedLink[], options: { now?: Date; freshnessDays?: number; limit?: number } = {}) {
  const now = options.now ?? new Date();
  const freshnessDays = Math.max(1, options.freshnessDays ?? DEFAULT_HOMEPAGE_FRESHNESS_DAYS);
  const limit = Math.max(0, options.limit ?? 6);
  const originals: HomepageStory[] = articles.map((article) => {
    const updated = materiallyUpdated(article);
    const effectiveDate = updated ? article.updatedAt : article.publishedAt;
    const isRecent = recent(effectiveDate, now, freshnessDays);
    return {
      id: `internal:${article.slug}`, headline: article.headline, summary: article.dek,
      href: `/news/${article.slug}/`, category: article.category, date: effectiveDate,
      dateLabel: updated ? "Updated" : "Published", byline: article.author, external: false,
      readMinutes: readingTime(article), editorialLabel: isRecent ? null : "Editor's pick",
      image: article.hero, rank: article.featured && isRecent ? 1 : updated && isRecent ? 2 : isRecent ? 3 : 5,
    };
  });
  const external: HomepageStory[] = curated.map((entry) => {
    const isRecent = recent(entry.dateAdded, now, freshnessDays) || recent(entry.publicationDate, now, freshnessDays);
    return {
      id: `external:${entry.url}`, headline: entry.title, summary: entry.whyItMatters, href: entry.url,
      category: entry.topic, date: entry.publicationDate, dateLabel: "Published", byline: entry.publisher,
      external: true, readMinutes: null, editorialLabel: isRecent ? null : "Editor's pick", image: null,
      rank: isRecent ? 4 : 5,
    };
  });
  const stories = [...originals, ...external]
    .sort((a, b) => a.rank - b.rank || timestamp(b.date) - timestamp(a.date) || a.headline.localeCompare(b.headline))
    .slice(0, limit);
  const hasRecentStories = stories.some((story) => story.rank < 5);
  return { stories, hasRecentStories, heading: hasRecentStories ? "What Matters Now" : "Editor’s Picks" } as const;
}
