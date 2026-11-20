import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminContext } from "@/lib/auth";
import { getAdminClient } from "@/lib/supabase/admin";
import { indexText, fetchUrlContent } from "@/lib/knowledge";
import { isOpenAIConfigured } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  type: z.enum(["text", "faq", "url"]),
  title: z.string().min(1).max(200),
  content: z.string().max(20000).optional(),
  url: z.string().url().optional(),
});

export async function GET() {
  const admin = await getAdminContext();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getAdminClient();
  const { data } = await db
    .from("knowledge_documents")
    .select("*")
    .eq("organization_id", admin.organizationId)
    .order("created_at", { ascending: false });

  return NextResponse.json({ documents: data || [] });
}

export async function POST(req: NextRequest) {
  const admin = await getAdminContext();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isOpenAIConfigured()) {
    return NextResponse.json(
      { error: "OpenAI isn't configured. Add OPENAI_API_KEY to enable indexing." },
      { status: 503 }
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { type, title } = parsed.data;

  try {
    if (type === "url") {
      if (!parsed.data.url) {
        return NextResponse.json({ error: "URL is required." }, { status: 400 });
      }
      const content = await fetchUrlContent(parsed.data.url);
      if (!content || content.length < 20) {
        return NextResponse.json(
          { error: "Couldn't extract readable content from that URL." },
          { status: 422 }
        );
      }
      const result = await indexText(admin.organizationId, {
        title,
        content,
        sourceType: "url",
        url: parsed.data.url,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (!parsed.data.content || parsed.data.content.trim().length < 2) {
      return NextResponse.json(
        { error: "Content is required." },
        { status: 400 }
      );
    }

    const result = await indexText(admin.organizationId, {
      title,
      content: parsed.data.content,
      sourceType: type,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("Knowledge POST failed:", err);
    return NextResponse.json(
      { error: "Failed to index content. Please try again." },
      { status: 500 }
    );
  }
}
