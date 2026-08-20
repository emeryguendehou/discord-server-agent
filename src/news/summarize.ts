import { z } from "zod";
import type { NewsItem } from "./fetch.js";

const DigestItemSchema = z.object({
  title: z.string(),
  whatChanges: z.string(),
  whyImportant: z.string(),
  forWhom: z.string(),
  score: z.number().min(1).max(10),
  sourceLink: z.string(),
});
export type DigestItem = z.infer<typeof DigestItemSchema>;

function buildPrompt(serverName: string, topics: string): string {
  return `Tu es l'agent de veille du serveur Discord francophone "${serverName}". On te donne une liste
d'articles/vidéos récents (titre, source, extrait, lien). Ta mission :

1. Sélectionne au maximum 3 informations réellement fortes et vérifiables (annonces primaires, sorties
   significatives, changements majeurs). Thèmes acceptés : ${topics}.
2. Écarte les rumeurs non vérifiées, les micro-annonces sans valeur, et tout doublon thématique (si deux sources
   parlent du même événement, garde la meilleure et ignore l'autre).
3. S'il n'y a rien d'assez fort aujourd'hui, renvoie un tableau vide -- ne force jamais à 3.
4. Pour chaque info retenue, rédige en français : un titre court reformulé, ce qui change, pourquoi c'est
   important, pour qui, un score d'importance/pertinence de 1 à 10, et le lien source exact fourni (ne le modifie
   pas).

Réponds uniquement en JSON, un tableau d'objets avec les clés : title, whatChanges, whyImportant, forWhom, score,
sourceLink.

Articles à évaluer :
`;
}

export async function summarizeDigest(
  candidates: NewsItem[],
  apiKey: string,
  model = "gemini-3.6-flash",
  serverName = "ce serveur",
  topics = "actualités générales"
): Promise<DigestItem[]> {
  if (candidates.length === 0) return [];

  const articlesText = candidates
    .map(
      (c, i) =>
        `${i + 1}. [${c.sourceName}] ${c.title}\n   Lien: ${c.link}\n   Extrait: ${c.excerpt || "(pas d'extrait)"}`
    )
    .join("\n\n");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(serverName, topics) + articlesText }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.3 },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini API error ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Réponse Gemini vide ou inattendue: " + JSON.stringify(data));

  const parsed = JSON.parse(text);
  return z.array(DigestItemSchema).parse(parsed).slice(0, 3);
}
