import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { z } from "zod";

const NewsSourceSchema = z.object({
  key: z.string(),
  name: z.string(),
  type: z.enum(["rss", "youtube"]),
  url: z.string(),
  note: z.string().optional(),
});

export type NewsSource = z.infer<typeof NewsSourceSchema>;

export function loadNewsSources(path = "config/news_sources.yml"): NewsSource[] {
  const raw = load(readFileSync(path, "utf8"));
  return z.array(NewsSourceSchema).parse(raw);
}
