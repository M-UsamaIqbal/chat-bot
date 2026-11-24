"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { uid } from "@/lib/utils";
import type { ChatMessage } from "@/lib/types";

const SESSION_KEY = "wta_chat_session";
const HISTORY_KEY = "wta_chat_history";

function getSessionId(): string {
  if (typeof window === "undefined") return uid() + uid();
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = uid() + uid();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export interface UseChatOptions {
  orgSlug?: string;
  welcomeMessage?: string;
  apiUrl?: string;
}

export function useChat({ orgSlug, welcomeMessage, apiUrl = "/api/chat" }: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<string>("");
  const abortRef = useRef<AbortController | null>(null);

  // Initialize session + restore history once on mount.
  useEffect(() => {
    sessionRef.current = getSessionId();
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as ChatMessage[];
        if (Array.isArray(parsed) && parsed.length) {
          setMessages(parsed);
          return;
        }
      }
    } catch {
      /* ignore corrupt history */
    }
    if (welcomeMessage) {
      setMessages([
        {
          id: uid(),
          role: "assistant",
          content: welcomeMessage,
          createdAt: new Date().toISOString(),
        },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist history whenever it changes.
  useEffect(() => {
    if (messages.length) {
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-50)));
      } catch {
        /* storage full / disabled — non-fatal */
      }
    }
  }, [messages]);

  const sendMessage = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || isStreaming) return;
      setError(null);

      const userMsg: ChatMessage = {
        id: uid(),
        role: "user",
        content,
        createdAt: new Date().toISOString(),
      };
      const assistantId = uid();

      setMessages((prev) => [
        ...prev,
        userMsg,
        { id: assistantId, role: "assistant", content: "", createdAt: new Date().toISOString() },
      ]);
      setIsStreaming(true);

      // Build the payload from current history + the new user message.
      const payloadMessages = [...messages, userMsg]
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content }));

      abortRef.current = new AbortController();

      try {
        const res = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: sessionRef.current,
            orgSlug,
            messages: payloadMessages,
          }),
          signal: abortRef.current.signal,
        });

        if (!res.ok) {
          const msg =
            res.status === 429
              ? "You're sending messages too quickly. Please wait a moment."
              : "The assistant is unavailable right now. Please try again.";
          throw new Error(msg);
        }
        if (!res.body) throw new Error("No response stream.");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let newlineIndex: number;
          while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);
            if (!line) continue;
            try {
              const evt = JSON.parse(line);
              if (evt.type === "delta") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: m.content + evt.text }
                      : m
                  )
                );
              } else if (
                evt.type === "action" &&
                evt.action?.type === "audit" &&
                evt.action.payload?.result
              ) {
                // Attach the audit report so it renders as a visual card.
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, audit: evt.action.payload.result }
                      : m
                  )
                );
              } else if (evt.type === "error") {
                setError(evt.message);
              }
              // other "action" + "done" events are handled implicitly.
            } catch {
              /* skip malformed line */
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError((err as Error).message || "Something went wrong.");
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId && !m.content
              ? {
                  ...m,
                  content:
                    "⚠️ I couldn't reach the server. Please try again in a moment.",
                }
              : m
          )
        );
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [messages, isStreaming, orgSlug, apiUrl]
  );

  // Deterministic tracking-audit flow: scans the given URL via /api/audit and
  // renders the result card — no LLM guessing about the URL.
  const runAudit = useCallback(
    async (rawUrl: string) => {
      const url = rawUrl.trim();
      if (!url || isStreaming) return;
      setError(null);

      const userMsg: ChatMessage = {
        id: uid(),
        role: "user",
        content: url,
        createdAt: new Date().toISOString(),
      };
      const assistantId = uid();
      setMessages((prev) => [
        ...prev,
        userMsg,
        {
          id: assistantId,
          role: "assistant",
          content: "🔍 Scanning your site for tracking tags…",
          createdAt: new Date().toISOString(),
        },
      ]);
      setIsStreaming(true);

      try {
        const res = await fetch("/api/audit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const result = await res.json();
        if (!res.ok || !result) {
          throw new Error(result?.error || "The audit couldn't be completed.");
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? result.ok
                ? {
                    ...m,
                    content: `Here's your Tag Assistant report — ${result.foundCount} tracker${
                      result.foundCount === 1 ? "" : "s"
                    } detected. See the report below. 👇`,
                    audit: result,
                  }
                : { ...m, content: `⚠️ ${result.error || "Couldn't scan that site."}` }
              : m
          )
        );
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: `⚠️ ${(err as Error).message}` }
              : m
          )
        );
      } finally {
        setIsStreaming(false);
      }
    },
    [isStreaming]
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages(
      welcomeMessage
        ? [
            {
              id: uid(),
              role: "assistant",
              content: welcomeMessage,
              createdAt: new Date().toISOString(),
            },
          ]
        : []
    );
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {
      /* ignore */
    }
  }, [welcomeMessage]);

  return { messages, sendMessage, runAudit, isStreaming, error, reset };
}
