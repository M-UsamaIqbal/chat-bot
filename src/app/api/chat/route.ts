import { NextRequest } from "next/server";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { getAI, CHAT_MODEL } from "@/lib/openai";
import { resolveOrg } from "@/lib/org";
import { buildSystemPrompt } from "@/lib/prompts";
import { chatRequestSchema } from "@/lib/validation";
import { buildToolDefinitions, executeTool } from "@/lib/chat-tools";
import { ensureConversation, saveMessage } from "@/lib/conversations";
import { getKnowledgeContext } from "@/lib/knowledge";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { isOriginAllowed, corsHeaders } from "@/lib/origin";
import { isAIConfigured } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sse(obj: unknown) {
  return new TextEncoder().encode(JSON.stringify(obj) + "\n");
}

/** CORS preflight for cross-origin widget embeds. */
export async function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

export async function POST(req: NextRequest) {
  const cors = corsHeaders(req);

  // ---- Origin allow-list (opt-in via WIDGET_ALLOWED_ORIGINS) -------------
  if (!isOriginAllowed(req)) {
    return new Response(JSON.stringify({ error: "Origin not allowed." }), {
      status: 403,
      headers: { "Content-Type": "application/json", ...cors },
    });
  }

  // ---- Rate limiting (per IP) -------------------------------------------
  const ip = getClientIp(req);
  const rl = await rateLimit(`chat:${ip}`, 30, 60_000);
  if (!rl.success) {
    return new Response(
      JSON.stringify({ error: "Too many requests. Please slow down." }),
      { status: 429, headers: { "Content-Type": "application/json", ...cors } }
    );
  }

  // ---- Validate input ----------------------------------------------------
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Invalid request.", details: parsed.error.flatten() }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const { sessionId, orgSlug, messages } = parsed.data;

  // ---- Config guard ------------------------------------------------------
  if (!isAIConfigured()) {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          sse({
            type: "delta",
            text:
              "⚠️ The AI service isn't configured yet. Add a free Groq key as AI_API_KEY (plus AI_BASE_URL) to .env.local to enable live responses. (Running in demo mode.)",
          })
        );
        controller.enqueue(sse({ type: "done" }));
        controller.close();
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8", ...cors },
    });
  }

  const org = await resolveOrg(orgSlug);
  const conversationId = await ensureConversation(org, sessionId);

  // Persist the latest user message.
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (lastUser) await saveMessage(conversationId, org, "user", lastUser.content);

  // Ground the model in verified knowledge — retrieve only the pages relevant
  // to the latest question (keeps requests small for free-tier token limits).
  const knowledge = org.isFallback
    ? ""
    : await getKnowledgeContext(org.org.id, lastUser?.content || "");

  let instructions = buildSystemPrompt({
    ...org.config,
    orgName: org.org.name,
  });
  if (knowledge) {
    instructions += `\n\n## Verified Knowledge Base\nUse ONLY the information below to answer questions about the company. If the answer isn't here, say you don't have that information and offer a human.\n\n${knowledge}`;
  } else {
    instructions += `\n\n## Verified Knowledge Base\n(No knowledge base content has been added yet. Do not invent specifics — answer general questions briefly and offer to connect the visitor with the team for details.)`;
  }

  const tools = buildToolDefinitions(org) as unknown as ChatCompletionTool[];

  // Only send the most recent turns to stay within tight token-per-minute
  // limits (free-tier models). The latest user message is always included.
  const recent = messages.filter((m) => m.role !== "system").slice(-8);

  const chatMessages: ChatCompletionMessageParam[] = [
    { role: "system", content: instructions },
    ...recent.map(
      (m) => ({ role: m.role, content: m.content }) as ChatCompletionMessageParam
    ),
  ];

  const ai = getAI();

  const stream = new ReadableStream({
    async start(controller) {
      let assistantText = "";
      const ctx = { org, sessionId, conversationId };

      try {
        // Tool-calling loop: stream text, run any tools, continue until the
        // model produces a final answer with no further tool calls.
        for (let turn = 0; turn < 5; turn++) {
          const completion = await ai.chat.completions.create({
            model: CHAT_MODEL,
            messages: chatMessages,
            tools: tools.length ? tools : undefined,
            tool_choice: tools.length ? "auto" : undefined,
            temperature: 0.3,
            stream: true,
          });

          let turnText = "";
          const toolCalls: Record<
            number,
            { id: string; name: string; args: string }
          > = {};

          for await (const chunk of completion) {
            const delta = chunk.choices[0]?.delta;
            if (!delta) continue;

            if (delta.content) {
              turnText += delta.content;
              assistantText += delta.content;
              controller.enqueue(sse({ type: "delta", text: delta.content }));
            }

            for (const tc of delta.tool_calls || []) {
              const idx = tc.index ?? 0;
              if (!toolCalls[idx])
                toolCalls[idx] = { id: "", name: "", args: "" };
              if (tc.id) toolCalls[idx].id = tc.id;
              if (tc.function?.name) toolCalls[idx].name = tc.function.name;
              if (tc.function?.arguments)
                toolCalls[idx].args += tc.function.arguments;
            }
          }

          const calls = Object.values(toolCalls).filter((c) => c.name);

          // Record the assistant turn (text and/or tool calls).
          chatMessages.push({
            role: "assistant",
            content: turnText || null,
            ...(calls.length
              ? {
                  tool_calls: calls.map((c) => ({
                    id: c.id,
                    type: "function" as const,
                    function: { name: c.name, arguments: c.args || "{}" },
                  })),
                }
              : {}),
          } as ChatCompletionMessageParam);

          if (calls.length === 0) break;

          // Execute each tool and feed the results back for the next turn.
          for (const c of calls) {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(c.args || "{}");
            } catch {
              args = {};
            }
            const result = await executeTool(c.name, args, ctx);
            if (result.action) {
              controller.enqueue(
                sse({ type: "action", action: result.action })
              );
            }
            chatMessages.push({
              role: "tool",
              tool_call_id: c.id,
              content: result.output,
            });
          }
        }

        if (assistantText.trim()) {
          await saveMessage(conversationId, org, "assistant", assistantText);
        }
        controller.enqueue(sse({ type: "done" }));
        controller.close();
      } catch (err) {
        console.error("Chat stream error:", err);
        controller.enqueue(
          sse({
            type: "error",
            message:
              "Sorry — something went wrong reaching the assistant. Please try again.",
          })
        );
        controller.enqueue(sse({ type: "done" }));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      ...cors,
    },
  });
}
