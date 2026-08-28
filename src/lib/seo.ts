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
  article?: ArticleMetadata;
}

export interface SitemapPage extends SeoMetadata {
  lastModified?: string;
}

export const PUBLIC_PAGES: SitemapPage[] = [
  { canonicalPath: "/", title: "Seattle Seahawks Season Hub | Seahawks Fan Zone", description: "Seattle Seahawks schedule, results, standings, statistical leaders, and original game recaps in one independent season hub." },
  { canonicalPath: "/news", title: "Seattle Seahawks News and Analysis | Seahawks Fan Zone", description: "Original Seattle Seahawks news, analysis, roster context, injuries, game-week coverage and NFC West perspective." },
  { canonicalPath: "/schedule", title: "Seattle Seahawks Schedule | Seahawks Fan Zone", description: "Browse the Seattle Seahawks schedule, kickoff times, opponents, locations, and final scores for the current season." },
  { canonicalPath: "/weekly-recap", title: "Seattle Seahawks Game Recaps | Seahawks Fan Zone", description: "Read original Seattle Seahawks game recaps with final scores, turning points, and season context." },
  { canonicalPath: "/news/around-the-web", title: "Seahawks Around the Web | Curated Seattle Reading", description: "A hand-curated Seahawks reading digest with source attribution, original Seattle-focused commentary, and links to worthwhile reporting around the web.", lastModified: "2026-02-13" },
  { canonicalPath: "/standings", title: "Seattle Seahawks Standings | Seahawks Fan Zone", description: "See Seattle's current NFC West and conference position with season-aware NFL standings." },
  { canonicalPath: "/team", title: "Seattle Seahawks Team Stats | Seahawks Fan Zone", description: "Explore season-aware Seattle Seahawks team totals, scoring, offense, defense, and situational statistics." },
  { canonicalPath: "/players", title: "Seattle Seahawks Players and Stats | Seahawks Fan Zone", description: "Browse the Seattle Seahawks roster and season-aware player passing, rushing, receiving, and defensive statistics." },
  { canonicalPath: "/team/transactions", title: "Seattle Seahawks Transactions | Seahawks Fan Zone", description: "Track sourced Seattle Seahawks signings, waivers, releases, claims, reserve-list moves, trades, and contract updates." },
  { canonicalPath: "/team/injuries", title: "Seattle Seahawks Injuries and Status | Seahawks Fan Zone", description: "Review sourced Seattle Seahawks injury and participation-status updates without medical speculation." },
  { canonicalPath: "/history", title: "Seattle Seahawks History and The 12s | Seahawks Fan Zone", description: "Explore defining Seattle Seahawks eras, franchise milestones, notable players, and the history of the 12s." },
  { canonicalPath: "/about", title: "About Seahawks Fan Zone", description: "Learn about Seahawks Fan Zone, an independent source for Seattle football statistics, recaps, and historical context." },
  { canonicalPath: "/methodology", title: "Data Methodology | Seahawks Fan Zone", description: "Learn how Seahawks Fan Zone sources, checks, and updates schedule, team, player, and recap information." },
  { canonicalPath: "/disclosure", title: "Advertising and Affiliate Disclosure | Seahawks Fan Zone", description: "Read the advertising, affiliate-link, and editorial-independence disclosure for Seahawks Fan Zone." },
];

export const PRIVATE_UTILITY_PAGES: SitemapPage[] = [
  { canonicalPath: "/privacy-policy", title: "Privacy Policy | Seahawks Fan Zone", description: "Read how Seahawks Fan Zone handles basic usage data, cookies, analytics, advertising, and privacy requests.", robots: "noindex, follow" },
  { canonicalPath: "/sources", title: "Corrections and Feedback | Seahawks Fan Zone", description: "Contact Seahawks Fan Zone about factual corrections, data issues, feedback, or rights requests.", robots: "noindex, follow" },
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
