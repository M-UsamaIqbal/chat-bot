import { NextRequest, NextResponse } from "next/server";
import { getAdminContext } from "@/lib/auth";
import { indexFileText } from "@/lib/knowledge";
import { isAIConfigured } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB of text
// Text-based formats we can read directly without a paid parsing service.
const ALLOWED = [".txt", ".md", ".csv", ".json", ".html", ".htm"];

export async function POST(req: NextRequest) {
  const admin = await getAdminContext();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isAIConfigured()) {
    return NextResponse.json(
      { error: "AI provider isn't configured. Add AI_API_KEY to enable the assistant." },
      { status: 503 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const file = form.get("file");
  const title = (form.get("title") as string) || "";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File exceeds the 5 MB limit." }, { status: 413 });
  }
  const lower = file.name.toLowerCase();
  if (!ALLOWED.some((ext) => lower.endsWith(ext))) {
    return NextResponse.json(
      {
        error: `Unsupported file type on the free tier. Allowed: ${ALLOWED.join(
          ", "
        )}. For PDF/DOCX, paste the text using the "Text" tab instead.`,
      },
      { status: 415 }
    );
  }

  try {
    const content = await file.text();
    if (!content.trim()) {
      return NextResponse.json(
        { error: "The file appears to be empty." },
        { status: 422 }
      );
    }
    const result = await indexFileText(
      admin.organizationId,
      title || file.name,
      content
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("File index failed:", err);
    return NextResponse.json(
      { error: "Failed to index the file. Please try again." },
      { status: 500 }
    );
  }
}
