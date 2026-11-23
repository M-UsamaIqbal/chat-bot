import { getAdminClient } from "@/lib/supabase/admin";

/**
 * Knowledge-base helpers.
 *
 * Because the chatbot runs on free, OpenAI-compatible providers (Groq, etc.)
 * that don't offer a hosted vector store / File Search, knowledge is stored as
 * plain text in Supabase and injected into the model's context at chat time
 * (see getKnowledgeContext). This keeps answers grounded in verified company
 * information without any paid retrieval service.
 */

// Keep injected knowledge small so requests stay within free-tier token limits
// (e.g. Groq gpt-oss-20b = 8k tokens/min). We retrieve only the most relevant
// pages per question instead of dumping the whole knowledge base.
const CONTEXT_CHAR_BUDGET = 6_000;
const MAX_DOCS = 4;
const PER_DOC_CHARS = 1_800;

// Docs whose title starts with this are "pinned": always injected first,
// regardless of keyword score. Used for the capabilities/overview doc so the bot
// can answer meta questions ("what can you help with?", "what do you offer?")
// even though those have almost no usable keyword signal.
const PINNED_TITLE_PREFIX = "Overview —";

/** Stores text/FAQ/URL content for retrieval-by-injection. */
export async function indexText(
  organizationId: string,
  opts: {
    title: string;
    content: string;
    sourceType: "faq" | "url" | "text";
    url?: string | null;
  }
): Promise<{ documentId: string }> {
  const db = getAdminClient();
  const { data, error } = await db
    .from("knowledge_documents")
    .insert({
      organization_id: organizationId,
      title: opts.title,
      source_type: opts.sourceType,
      content: opts.content.slice(0, 50_000),
      url: opts.url ?? null,
      status: "indexed",
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return { documentId: data.id };
}

/**
 * Stores an uploaded text-based file's content. Binary formats (PDF, DOCX) can't
 * be parsed without extra libraries on the free tier — callers should guard the
 * accepted types and ask users to paste those as text instead.
 */
export async function indexFileText(
  organizationId: string,
  title: string,
  content: string
): Promise<{ documentId: string }> {
  const db = getAdminClient();
  const { data, error } = await db
    .from("knowledge_documents")
    .insert({
      organization_id: organizationId,
      title,
      source_type: "file",
      content: content.slice(0, 50_000),
      status: "indexed",
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return { documentId: data.id };
}

/** Removes a document from the knowledge base. */
export async function deleteDocument(
  organizationId: string,
  documentId: string
): Promise<void> {
  const db = getAdminClient();
  await db
    .from("knowledge_documents")
    .delete()
    .eq("id", documentId)
    .eq("organization_id", organizationId);
}

/** Extracts meaningful search terms (3+ chars) from a query. */
function queryTerms(query: string): string[] {
  const stop = new Set([
    "the", "and", "for", "you", "your", "are", "can", "does", "with", "what",
    "how", "which", "about", "that", "this", "have", "has", "our", "they",
    "offer", "want", "need", "like", "would", "could", "will", "from", "into",
  ]);
  return [
    ...new Set(
      (query.toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter(
        (t) => !stop.has(t)
      )
    ),
  ];
}

/** Scores a document's relevance to the query terms (title matches weighted). */
function scoreDoc(
  doc: { title: string | null; content: string | null },
  terms: string[]
): number {
  const title = (doc.title || "").toLowerCase();
  const content = (doc.content || "").toLowerCase();
  let score = 0;
  for (const t of terms) {
    if (title.includes(t)) score += 5;
    let idx = 0;
    let count = 0;
    while ((idx = content.indexOf(t, idx)) >= 0 && count < 10) {
      count++;
      idx += t.length;
    }
    score += count;
  }
  return score;
}

/** Returns the most relevant slice of content, centered on the first term hit. */
function bestSnippet(content: string, terms: string[]): string {
  if (content.length <= PER_DOC_CHARS) return content;
  const lower = content.toLowerCase();
  let hit = -1;
  for (const t of terms) {
    const i = lower.indexOf(t);
    if (i >= 0 && (hit < 0 || i < hit)) hit = i;
  }
  if (hit < 0) return content.slice(0, PER_DOC_CHARS);
  const start = Math.max(0, hit - Math.floor(PER_DOC_CHARS / 3));
  return (start > 0 ? "…" : "") + content.slice(start, start + PER_DOC_CHARS);
}

/**
 * Retrieval-based grounding: fetches the organization's knowledge and returns
 * only the most relevant pages for the given query, within a tight char budget.
 * This keeps each chat request small enough for free-tier token limits while
 * still answering accurately. Returns "" when there's no knowledge.
 */
export async function getKnowledgeContext(
  organizationId: string,
  query = ""
): Promise<string> {
  try {
    const db = getAdminClient();
    const { data } = await db
      .from("knowledge_documents")
      .select("title, content, url")
      .eq("organization_id", organizationId)
      .eq("status", "indexed")
      .limit(200);

    if (!data || data.length === 0) return "";

    const terms = queryTerms(query);

    // Pin the overview/capabilities doc(s) so they're always available — meta
    // questions ("what do you offer?") carry no keyword signal to retrieve them.
    const pinned = data.filter((d) =>
      (d.title || "").startsWith(PINNED_TITLE_PREFIX)
    );
    const rest = data.filter(
      (d) => !(d.title || "").startsWith(PINNED_TITLE_PREFIX)
    );

    // Rank the remaining docs by relevance; with no usable query terms, fall
    // back to the first docs.
    const ranked =
      terms.length > 0
        ? rest
            .map((d) => ({ d, s: scoreDoc(d, terms) }))
            .sort((a, b) => b.s - a.s)
        : rest.map((d) => ({ d, s: 1 }));

    const picked = ranked.filter((r) => r.s > 0).slice(0, MAX_DOCS);
    const chosen = picked.length > 0 ? picked : ranked.slice(0, 2);

    // Pinned docs first, then the top-ranked docs, within the char budget.
    const ordered = [...pinned.map((d) => ({ d })), ...chosen];

    let budget = CONTEXT_CHAR_BUDGET;
    const blocks: string[] = [];
    for (const { d } of ordered) {
      if (!d.content) continue;
      const snippet = bestSnippet(d.content, terms);
      const header = `### ${d.title}${d.url ? ` (${d.url})` : ""}`;
      const block = `${header}\n${snippet}`.slice(0, budget);
      blocks.push(block);
      budget -= block.length;
      if (budget <= 300) break;
    }
    return blocks.join("\n\n");
  } catch (err) {
    console.error("getKnowledgeContext failed:", err);
    return "";
  }
}

/** Fetches a URL and extracts readable plain text (best-effort HTML strip). */
export async function fetchUrlContent(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Support-KB-Importer/1.0" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Failed to fetch URL (${res.status}).`);
  const html = await res.text();

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

  return text.slice(0, 50_000);
}
