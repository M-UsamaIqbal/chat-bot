"use client";

import { useEffect, useRef, useState } from "react";
import {
  MessageCircle,
  X,
  Send,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  CalendarCheck,
} from "lucide-react";
import { useChat } from "@/hooks/use-chat";
import { MessageBubble } from "./message-bubble";
import { TypingIndicator } from "./typing-indicator";
import { AuditCard } from "./audit-card";
import { cn } from "@/lib/utils";

export interface ChatWidgetProps {
  orgSlug?: string;
  botName?: string;
  welcomeMessage?: string;
  suggestedQuestions?: string[];
  primaryColor?: string;
  bookingUrl?: string | null;
  /** When true, render inline (no floating button) — used by the /widget iframe. */
  embedded?: boolean;
  apiUrl?: string;
}

export function ChatWidget({
  orgSlug,
  botName = "AI Support Assistant",
  welcomeMessage,
  suggestedQuestions = [],
  primaryColor = "#5A24BA",
  bookingUrl,
  embedded = false,
  apiUrl,
}: ChatWidgetProps) {
  const [open, setOpen] = useState(embedded);
  const [input, setInput] = useState("");
  const [auditMode, setAuditMode] = useState(false);
  const { messages, sendMessage, runAudit, isStreaming, error, reset } = useChat({
    orgSlug,
    welcomeMessage,
    apiUrl,
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isStreaming, open]);

  const handleSend = () => {
    if (!input.trim()) return;
    if (auditMode) {
      runAudit(input);
      setAuditMode(false);
    } else {
      sendMessage(input);
    }
    setInput("");
    inputRef.current?.focus();
  };

  const startAudit = () => {
    setAuditMode(true);
    setInput("");
    inputRef.current?.focus();
  };

  const lastMessage = messages[messages.length - 1];
  const showTyping =
    isStreaming && lastMessage?.role === "assistant" && !lastMessage.content;
  const showSuggestions =
    suggestedQuestions.length > 0 &&
    messages.filter((m) => m.role === "user").length === 0 &&
    !isStreaming;

  const panel = (
    <div
      className={cn(
        "flex flex-col overflow-hidden bg-background shadow-2xl ring-1 ring-black/5",
        embedded
          ? "h-full w-full"
          : "fixed bottom-24 right-5 z-[60] h-[min(640px,calc(100vh-7rem))] w-[min(400px,calc(100vw-2.5rem))] rounded-2xl animate-fade-in-up sm:right-6"
      )}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 text-white"
        style={{ backgroundColor: primaryColor }}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">{botName}</div>
            <div className="flex items-center gap-1.5 text-xs text-white/80">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
              Online
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={reset}
            title="Start a new conversation"
            className="rounded-md p-1.5 transition-colors hover:bg-white/20"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          {!embedded && (
            <button
              onClick={() => setOpen(false)}
              title="Close"
              className="rounded-md p-1.5 transition-colors hover:bg-white/20"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="scrollbar-slim flex-1 space-y-3 overflow-y-auto bg-muted/30 px-4 py-4"
      >
        {messages.map((m) => (
          <div key={m.id} className="space-y-2">
            {m.content && <MessageBubble message={m} />}
            {m.audit && (
              <div className="flex justify-start">
                <div className="w-full max-w-[92%]">
                  <AuditCard
                    audit={m.audit}
                    bookingUrl={bookingUrl}
                    primaryColor={primaryColor}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
        {showTyping && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-muted px-2 py-1 shadow-sm">
              <TypingIndicator />
            </div>
          </div>
        )}

        {showSuggestions && (
          <div className="space-y-2 pt-1">
            <p className="px-1 text-xs font-medium text-muted-foreground">
              Suggested questions
            </p>
            {suggestedQuestions.map((q) => (
              <button
                key={q}
                onClick={() => sendMessage(q)}
                className="block w-full rounded-xl border border-border bg-background px-3 py-2 text-left text-sm transition-colors hover:border-primary/40 hover:bg-accent"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {error && (
          <p className="px-1 text-center text-xs text-destructive">{error}</p>
        )}
      </div>

      {/* Quick actions */}
      {!isStreaming && !auditMode && (
        <div className="flex flex-wrap gap-1.5 border-t bg-background px-3 pt-2.5">
          <button
            onClick={startAudit}
            className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-secondary px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
          >
            <ShieldCheck className="h-3.5 w-3.5" /> Tag Assistant
          </button>
          {bookingUrl && (
            <button
              onClick={() => sendMessage("I'd like to book a strategy call.")}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent"
            >
              <CalendarCheck className="h-3.5 w-3.5" /> Book a call
            </button>
          )}
        </div>
      )}

      {/* Audit prompt banner */}
      {auditMode && (
        <div className="flex items-center justify-between gap-2 border-t bg-secondary px-3 py-2 text-xs text-primary">
          <span className="flex items-center gap-1.5 font-medium">
            <ShieldCheck className="h-3.5 w-3.5" />
            Enter your website URL and Tag Assistant will scan its tracking setup
          </span>
          <button
            onClick={() => setAuditMode(false)}
            className="rounded p-0.5 hover:bg-primary/10"
            title="Cancel"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Composer */}
      <div className="border-t bg-background px-3 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={1}
            placeholder={
              auditMode ? "yourwebsite.com" : "Type your message…"
            }
            className="scrollbar-slim max-h-28 min-h-[40px] flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm transition-opacity disabled:opacity-40"
            style={{ backgroundColor: primaryColor }}
            title="Send"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
          AI assistant — answers are based on verified company information.
        </p>
      </div>
    </div>
  );

  if (embedded) return panel;

  return (
    <>
      {open && panel}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-[60] flex h-14 w-14 items-center justify-center rounded-full text-white shadow-xl transition-transform hover:scale-105 active:scale-95 sm:right-6"
        style={{ backgroundColor: primaryColor }}
        aria-label={open ? "Close chat" : "Open chat"}
      >
        {open ? (
          <X className="h-6 w-6" />
        ) : (
          <MessageCircle className="h-6 w-6" />
        )}
      </button>
    </>
  );
}
