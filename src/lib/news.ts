export const NEWS_CATEGORIES = ["News", "Analysis", "Roster", "Injuries", "Game Week", "Hard Knocks", "NFC West"] as const;

export type NewsCategory = typeof NEWS_CATEGORIES[number];
export type PublicationStatus = "draft" | "published" | "archived";

export interface NewsSource {
  label: string;
  url: string;
}

export interface HeroAsset {
  src: string;
  alt: string;
  width: number;
  height: number;
}

export interface NewsArticle {
  slug: string;
  headline: string;
  dek: string;
  publishedAt: string;
  updatedAt: string;
  author: string;
  category: NewsCategory;
  tags: string[];
  season: number | null;
  opponent: string | null;
  body: string[];
  sources: NewsSource[];
  hero: HeroAsset;
  featured: boolean;
  status: PublicationStatus;
}

const sharedHero: HeroAsset = {
  src: "/images/news/newsroom-field.svg",
  alt: "Abstract football field lines in Seahawks Fan Zone colors",
  width: 1200,
  height: 675,
};

const articles: NewsArticle[] = [
  {
    slug: "welcome-to-the-seahawks-fan-zone-newsroom",
    headline: "Welcome to the Seahawks Fan Zone newsroom",
    dek: "A new home for original Seahawks reporting, roster context, game-week analysis and accountable sourcing.",
    publishedAt: "2026-08-28",
    updatedAt: "2026-08-28",
    author: "Seahawks Fan Zone Editorial Team",
    category: "News",
    tags: ["Newsroom", "Editorial standards", "The 12s"],
    season: 2026,
    opponent: null,
    body: [
      "Seahawks Fan Zone is expanding beyond schedules and stat tables. This newsroom is built to connect the news of the day to the questions Seattle fans ask next: what a move means for the depth chart, where a performance fits statistically and how a result changes the road ahead.",
      "Every story here will be dated, attributed and written in original language. When reporting begins with information from another outlet or an official announcement, the story will link to that source and clearly separate reported facts from our analysis.",
      "The goal is useful context, not volume for its own sake. Roster stories should explain role and competition. Game-week coverage should connect opponent tendencies to Seattle's personnel. Analysis should show its work and avoid presenting a hunch as a fact.",
      "Readers can browse by category, search the archive or subscribe to the RSS feed. Empty desks will stay visible as a promise of coverage, but they will not be indexed as thin pages until they contain published work.",
    ],
    sources: [
      { label: "Seahawks Fan Zone methodology", url: "/methodology" },
      { label: "Corrections and feedback", url: "/sources" },
    ],
    hero: sharedHero,
    featured: true,
    status: "published",
  },
  {
    slug: "how-we-add-context-to-seahawks-roster-moves",
    headline: "How we will evaluate Seahawks roster moves",
    dek: "The transaction is only the beginning: role, replacement value, cap timing and schedule fit turn a move into a useful story.",
    publishedAt: "2026-08-28",
    updatedAt: "2026-08-28",
    author: "Seahawks Fan Zone Editorial Team",
    category: "Roster",
    tags: ["Roster", "Depth chart", "Analysis"],
    season: 2026,
    opponent: null,
    body: [
      "A name entering or leaving the roster is a fact. Its football meaning depends on much more: the snaps available at that position, the skills already represented in the room and the alternatives Seattle can use on game day.",
      "Our roster coverage will start with the player's likely role. We will look at recent participation and production when reliable data is available, while noting that raw totals can reflect opportunity as much as performance. A reserve who plays special teams may affect the active roster differently from a specialist signed for a narrow package.",
      "Timing matters, too. A preseason move can be about evaluation or injury coverage; an in-season move can answer an immediate matchup problem. We will connect those decisions to the schedule without claiming certainty about plans the team has not announced.",
      "That approach also means being comfortable with an incomplete answer. If contract terms, injury details or a corresponding move are not public, the story will say so and update only when new information materially changes the picture.",
    ],
    sources: [
      { label: "Seahawks Fan Zone player directory", url: "/players" },
      { label: "Seahawks Fan Zone methodology", url: "/methodology" },
    ],
    hero: sharedHero,
    featured: false,
    status: "published",
  },
  {
    slug: "a-better-way-to-read-seahawks-game-week",
    headline: "A better way to read Seahawks game week",
    dek: "Opponent, availability, recent form and schedule pressure belong in the same preview—not in isolated boxes.",
    publishedAt: "2026-08-28",
    updatedAt: "2026-08-28",
    author: "Seahawks Fan Zone Editorial Team",
    category: "Game Week",
    tags: ["Game Week", "Schedule", "Matchups"],
    season: 2026,
    opponent: null,
    body: [
      "Game-week coverage works best when it narrows a full week of information into a few questions that can decide Sunday. That requires more than repeating records or listing injury designations.",
      "Our previews will identify the matchup behind the matchup. That may be protection against a pressure front, tackling against yards after contact or Seattle's ability to create favorable down-and-distance situations. The specific question will change with the opponent and available personnel.",
      "We will use recent statistics as context rather than prediction. A small sample can describe what happened without proving what will happen next. When personnel, opponent strength or game state changes the meaning of a number, the preview should explain that limitation.",
      "Finally, each preview will place the game on the schedule. Travel, rest and the NFC West race can change the stakes, but they do not predetermine the result. The aim is to help the 12s watch with a sharper lens and return afterward to see which questions actually mattered.",
    ],
    sources: [
      { label: "Seahawks Fan Zone schedule", url: "/schedule" },
      { label: "Seahawks Fan Zone standings", url: "/standings" },
    ],
    hero: sharedHero,
    featured: false,
    status: "published",
  },
];

const validDate = (value: string) => Number.isFinite(new Date(value).getTime());
const slugs = new Set<string>();
for (const article of articles) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug) || slugs.has(article.slug)) throw new Error(`Invalid or duplicate news slug: ${article.slug}`);
  if (!NEWS_CATEGORIES.includes(article.category) || !validDate(article.publishedAt) || !validDate(article.updatedAt)) throw new Error(`Invalid news metadata: ${article.slug}`);
  if (new Date(article.updatedAt) < new Date(article.publishedAt)) throw new Error(`updatedAt precedes publishedAt: ${article.slug}`);
  slugs.add(article.slug);
}

export const publishedArticles = articles
  .filter((article) => article.status === "published")
  .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

export const NEWS_PAGE_SIZE = 6;
export const categorySlug = (category: NewsCategory) => category.toLowerCase().replaceAll(" ", "-");
export const formatArticleDate = (value: string) => new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value));
export const materiallyUpdated = (article: NewsArticle) => new Date(article.updatedAt).getTime() - new Date(article.publishedAt).getTime() >= 60 * 60 * 1000;
