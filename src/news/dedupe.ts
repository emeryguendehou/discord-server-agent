import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { NewsItem } from "./fetch.js";

const MAX_ENTRIES = 2000;

export interface SeenLedger {
  links: string[];
}

export function loadSeenLedger(path: string): SeenLedger {
  if (!existsSync(path)) return { links: [] };
  return JSON.parse(readFileSync(path, "utf8")) as SeenLedger;
}

export function saveSeenLedger(path: string, ledger: SeenLedger): void {
  mkdirSync(dirname(path), { recursive: true });
  const trimmed = ledger.links.slice(-MAX_ENTRIES);
  writeFileSync(path, JSON.stringify({ links: trimmed }, null, 2) + "\n", "utf8");
}

export function filterUnseen(items: NewsItem[], ledger: SeenLedger): NewsItem[] {
  const seen = new Set(ledger.links);
  return items.filter((item) => item.link && !seen.has(item.link));
}

export function markSeen(ledger: SeenLedger, items: NewsItem[]): SeenLedger {
  const links = new Set(ledger.links);
  for (const item of items) if (item.link) links.add(item.link);
  return { links: [...links] };
}
