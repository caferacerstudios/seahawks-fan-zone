export const SITE_NAME = "Seahawks Fan Zone";
export const SITE_URL = "https://seahawksfanzone.com";

export interface ArticleMetadata {
  headline: string;
  author: string;
  publishedTime: string;
  modifiedTime?: string;
  image: string;
  section?: string;
}

export interface SeoMetadata {
  title: string;
  description: string;
  canonicalPath: string;
  robots?: string;
  openGraphTitle?: string;
  openGraphDescription?: string;
  openGraphImage?: string;
  openGraphImageAlt?: string;
  article?: ArticleMetadata;
}

export interface SitemapPage extends SeoMetadata {
  lastModified?: string;
}

export const PUBLIC_PAGES: SitemapPage[] = [
  { canonicalPath: "/", title: "Seattle Seahawks News, Schedule, Roster and Analysis", description: "Follow Seattle Seahawks news and analysis, the next game, schedule, current roster, injury updates, results and essential franchise guides." },
  { canonicalPath: "/news", title: "Seattle Seahawks News and Original Analysis", description: "Read original Seattle Seahawks news and analysis covering roster decisions, injuries, games and the NFC West, with every published story in one archive." },
  { canonicalPath: "/schedule", title: "2026 Seattle Seahawks Schedule, Times and Results", description: "See the 2026 Seattle Seahawks schedule with opponents, dates, Pacific kickoff times, venues, game status and final scores as games are completed." },
  { canonicalPath: "/weekly-recap", title: "Seattle Seahawks Game Recaps | Seahawks Fan Zone", description: "Read original Seattle Seahawks game recaps with final scores, turning points, and season context." },
  { canonicalPath: "/news/around-the-web", title: "Seahawks Around the Web | Curated Seattle Reading", description: "A hand-curated Seahawks reading digest with source attribution, original Seattle-focused commentary, and links to worthwhile reporting around the web.", lastModified: "2026-02-13" },
  { canonicalPath: "/standings", title: "2026 Seattle Seahawks NFC West Standings", description: "Track Seattle's 2026 NFC West position, record and division results once games begin, with preseason and regular-season records clearly separated." },
  { canonicalPath: "/team", title: "2026 Seattle Seahawks Team Statistics", description: "Review verified 2026 Seattle Seahawks record and scoring totals as regular-season games are completed, with unavailable statistics clearly identified." },
  { canonicalPath: "/players", title: "2026 Seattle Seahawks Roster and Player Directory", description: "Browse the current 2026 Seattle Seahawks active roster, practice squad and reserve lists, plus player profiles and clearly labeled historical statistics." },
  { canonicalPath: "/team/transactions", title: "Seattle Seahawks Transactions and Roster Moves", description: "Track sourced Seattle Seahawks signings, releases, waivers, trades, reserve-list changes and contract updates in chronological order." },
  { canonicalPath: "/team/injuries", title: "Seattle Seahawks Injury and Player Status Updates", description: "Review sourced Seattle Seahawks injury, reserve-list and participation-status updates, with no unsupported medical or recovery speculation." },
  { canonicalPath: "/history", title: "Seattle Seahawks History, Eras and The 12s", description: "Explore a sourced guide to Seattle Seahawks history, including franchise milestones, championship eras, notable players and the story of the 12s." },
  { canonicalPath: "/tickets", title: "Seattle Seahawks Ticket Finder and Price Comparison", description: "Compare recent Seahawks ticket price observations and provider options, understand fee and freshness limits, and review independent buying guidance." },
  { canonicalPath: "/about", title: "About Seahawks Fan Zone", description: "Learn about Seahawks Fan Zone, an independent source for Seattle football statistics, recaps, and historical context." },
  { canonicalPath: "/contact", title: "Contact and Corrections | Seahawks Fan Zone", description: "Contact the Seahawks Fan Zone site owner about general feedback, corrections, rights concerns, or business inquiries." },
  { canonicalPath: "/methodology", title: "Data Methodology | Seahawks Fan Zone", description: "Learn how Seahawks Fan Zone sources, checks, and updates schedule, team, player, and recap information." },
  { canonicalPath: "/sources", title: "Sources | Seahawks Fan Zone", description: "Learn how Seahawks Fan Zone selects, attributes, and verifies editorial and structured-data sources." },
  { canonicalPath: "/disclosure", title: "Advertising and Affiliate Disclosure | Seahawks Fan Zone", description: "Read the advertising, affiliate-link, and editorial-independence disclosure for Seahawks Fan Zone." },
];

export const PRIVATE_UTILITY_PAGES: SitemapPage[] = [
  { canonicalPath: "/privacy-policy", title: "Privacy Policy | Seahawks Fan Zone", description: "Read how Seahawks Fan Zone handles basic usage data, cookies, analytics, advertising, and privacy requests.", robots: "noindex, follow" },
];

export function pageMetadata(pathname: string): SeoMetadata | undefined {
  const path = normalizePath(pathname);
  return [...PUBLIC_PAGES, ...PRIVATE_UTILITY_PAGES].find((page) => page.canonicalPath === path);
}

export function normalizePath(pathname: string): string {
  const path = pathname.split(/[?#]/, 1)[0] || "/";
  if (path === "/") return path;
  return path.replace(/\/+$/, "");
}

export function absoluteUrl(path: string): string {
  return new URL(normalizePath(path), `${SITE_URL}/`).toString();
}
