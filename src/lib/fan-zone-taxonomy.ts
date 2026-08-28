export const TOPICS = {
  players: { name: "Players", aliases: ["player", "player news"] },
  opponents: { name: "Opponents", aliases: ["opponent", "matchups", "matchup"] },
  roster: { name: "Roster", aliases: ["rosters", "depth chart"] },
  transactions: { name: "Transactions", aliases: ["transaction", "roster moves", "roster move"] },
  injuries: { name: "Injuries", aliases: ["injury", "injury report", "injury reports"] },
  "game-week": { name: "Game Week", aliases: ["gameweek", "game weeks", "weekly preview"] },
  "hard-knocks": { name: "Hard Knocks", aliases: ["hardknocks", "hard knocks news"] },
  "nfc-west": { name: "NFC West", aliases: ["nfc west standings", "nfc-west"] },
  championship: { name: "Championship", aliases: ["championships", "super bowl"] },
  draft: { name: "Draft", aliases: ["nfl draft", "draft news"] },
  "position-groups": { name: "Position Groups", aliases: ["position group", "positions", "position groups"] },
} as const;

export type TopicSlug = keyof typeof TOPICS;

const topicKey = (value: unknown) => String(value ?? "")
  .normalize("NFKC")
  .trim()
  .toLocaleLowerCase("en-US")
  .replace(/[–—_]+/g, "-")
  .replace(/\s+/g, " ");

const aliasMap = new Map<string, TopicSlug>();
for (const [slug, topic] of Object.entries(TOPICS) as [TopicSlug, (typeof TOPICS)[TopicSlug]][]) {
  [slug, topic.name, ...topic.aliases].forEach((alias) => aliasMap.set(topicKey(alias), slug));
}

/** Returns one canonical slug for known spellings and capitalization; unknown tags are rejected. */
export function normalizeTopic(value: unknown): TopicSlug | null {
  return aliasMap.get(topicKey(value)) ?? null;
}

export function topicName(value: unknown): string | null {
  const slug = normalizeTopic(value);
  return slug ? TOPICS[slug].name : null;
}

export function topicHref(value: unknown): string | null {
  const slug = normalizeTopic(value);
  return slug ? `/topics/${slug}` : null;
}

export interface RelatedContentItem {
  id: string;
  title: string;
  href: string;
  playerIds?: string[];
  opponent?: string;
  gameId?: string;
  week?: string | number;
  topics?: unknown[];
  publishedAt?: string;
  editorial?: boolean;
}

export interface RelatedContentContext extends Omit<RelatedContentItem, "id" | "title" | "href" | "editorial"> {
  excludeId?: string;
}

const overlap = (left: string[] = [], right: string[] = []) => left.some((value) => right.includes(value));
const normalizedTopics = (values: unknown[] = []) => values.map(normalizeTopic).filter((value): value is TopicSlug => Boolean(value));

/**
 * Deterministic editorial ranking: player, opponent, game/week, topic, then recency.
 * Items must be explicitly supplied and marked editorial; this never infers behavior or sponsorship.
 */
export function rankRelatedContent(items: RelatedContentItem[], context: RelatedContentContext, limit = 6): RelatedContentItem[] {
  const contextPlayers = (context.playerIds ?? []).map(String);
  const contextOpponent = String(context.opponent ?? "").toUpperCase();
  const contextTopics = normalizedTopics(context.topics);
  const score = (item: RelatedContentItem) => {
    const samePlayer = overlap((item.playerIds ?? []).map(String), contextPlayers) ? 1 : 0;
    const sameOpponent = contextOpponent && String(item.opponent ?? "").toUpperCase() === contextOpponent ? 1 : 0;
    const sameGame = context.gameId && String(item.gameId ?? "") === String(context.gameId) ? 1 : 0;
    const sameWeek = context.week != null && String(item.week ?? "") === String(context.week) ? 1 : 0;
    const sameTopic = overlap(normalizedTopics(item.topics), contextTopics) ? 1 : 0;
    const recent = Number.isFinite(new Date(item.publishedAt ?? 0).getTime()) ? new Date(item.publishedAt ?? 0).getTime() : 0;
    return [samePlayer, Number(Boolean(sameOpponent)), Number(Boolean(sameGame || sameWeek)), sameTopic, recent];
  };

  return items
    .filter((item) => item.editorial === true && item.id !== context.excludeId)
    .sort((a, b) => {
      const left = score(a);
      const right = score(b);
      for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return right[index] - left[index];
      return a.title.localeCompare(b.title);
    })
    .slice(0, Math.max(0, limit));
}
