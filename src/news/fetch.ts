import Parser from "rss-parser";
import type { NewsSource } from "./sources.js";

export interface NewsItem {
  sourceKey: string;
  sourceName: string;
  title: string;
  link: string;
  publishedAt: Date | null;
  excerpt: string;
}

const parser = new Parser({
  headers: { "User-Agent": "Mozilla/5.0 (compatible; DiscordServerAgentNewsBot/1.0)" },
  timeout: 15000,
});

function stripHtml(html: string | undefined): string {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

export async function fetchSource(source: NewsSource): Promise<NewsItem[]> {
  try {
    const feed = await parser.parseURL(source.url);
    return (feed.items ?? []).map((item) => ({
      sourceKey: source.key,
      sourceName: source.name,
      title: item.title ?? "(sans titre)",
      link: item.link ?? "",
      publishedAt: item.isoDate ? new Date(item.isoDate) : item.pubDate ? new Date(item.pubDate) : null,
      excerpt: stripHtml(item.contentSnippet ?? item.content ?? item.summary),
    }));
  } catch (err) {
    console.error(`[fetch] échec source "${source.name}" (${source.url}):`, (err as Error).message);
    return [];
  }
}

export async function fetchAllSources(sources: NewsSource[]): Promise<NewsItem[]> {
  const results = await Promise.all(sources.map(fetchSource));
  return results.flat();
}

/** Ne garde que les items publiés dans la fenêtre récente (évite d'engloutir tout l'historique au premier run). */
export function filterRecent(items: NewsItem[], maxAgeHours: number): NewsItem[] {
  const cutoff = Date.now() - maxAgeHours * 3600_000;
  return items.filter((item) => !item.publishedAt || item.publishedAt.getTime() >= cutoff);
}
