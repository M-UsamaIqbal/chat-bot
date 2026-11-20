import Link from "next/link";
import {
  Sparkles,
  MessageSquare,
  Database,
  Users,
  ShieldCheck,
  ArrowRight,
  BarChart3,
} from "lucide-react";
import { ChatWidget } from "@/components/chat/chat-widget";
import { resolveOrg } from "@/lib/org";
import { isOpenAIConfigured, isSupabaseConfigured } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { org, config, isFallback } = await resolveOrg();
  const openaiReady = isOpenAIConfigured();
  const supabaseReady = isSupabaseConfigured();

  const features = [
    {
      icon: MessageSquare,
      title: "AI chat widget",
      desc: "Streaming, on-brand assistant that answers from verified company knowledge.",
    },
    {
      icon: Database,
      title: "Knowledge base",
      desc: "Upload docs, FAQs, and URLs. The AI never invents pricing or policies.",
    },
    {
      icon: Users,
      title: "Lead capture",
      desc: "Collects name, email, and requirements — deduplicated into your CRM.",
    },
    {
      icon: ShieldCheck,
      title: "Human handoff",
      desc: "Detects when a human is needed and routes unresolved chats to your team.",
    },
    {
      icon: BarChart3,
      title: "Admin dashboard",
      desc: "Conversations, leads, analytics, and chatbot settings in one place.",
    },
    {
      icon: Sparkles,
      title: "SaaS-ready",
      desc: "Multi-tenant schema, RLS, rate limiting, and server-side secrets.",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </div>
            <span className="text-lg font-bold tracking-tight">
              Support AI
            </span>
          </div>
          <nav className="flex items-center gap-2">
            <Link
              href="/admin"
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Admin
            </Link>
            <Link
              href="/admin/login"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              Dashboard <ArrowRight className="h-4 w-4" />
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="container flex flex-col items-center py-20 text-center md:py-28">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          AI Customer Support, grounded in your real content
        </div>
        <h1 className="max-w-3xl text-balance text-4xl font-bold tracking-tight md:text-6xl">
          Instant, accurate support for{" "}
          <span className="text-primary">your</span> customers
        </h1>
        <p className="mt-5 max-w-2xl text-pretty text-lg text-muted-foreground">
          A production-ready AI assistant that answers from verified company
          knowledge, captures leads, and hands off to your team — without ever
          inventing pricing or policies.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            data-open-chat
          >
            <MessageSquare className="h-4 w-4" /> Try the live assistant
          </button>
          <Link
            href="/admin/login"
            className="inline-flex items-center gap-2 rounded-lg border px-5 py-3 text-sm font-semibold transition-colors hover:bg-accent"
          >
            Open admin dashboard
          </Link>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Click the chat bubble in the bottom-right corner to start.
        </p>
      </section>

      {/* Setup status */}
      {(isFallback || !openaiReady || !supabaseReady) && (
        <section className="container pb-8">
          <div className="mx-auto max-w-3xl rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
            <p className="font-semibold">Setup checklist</p>
            <ul className="mt-2 space-y-1">
              <li>
                {openaiReady ? "✅" : "⬜️"} <strong>OpenAI</strong> —{" "}
                {openaiReady
                  ? "configured"
                  : "add a free Groq key (AI_API_KEY) to .env.local for live AI answers"}
              </li>
              <li>
                {supabaseReady ? "✅" : "⬜️"} <strong>Supabase</strong> —{" "}
                {supabaseReady
                  ? "configured"
                  : "add Supabase keys + run the migration to persist data"}
              </li>
            </ul>
            <p className="mt-2 text-amber-800">
              The widget still works in demo mode — see{" "}
              <code className="rounded bg-amber-100 px-1">README.md</code> for
              setup steps.
            </p>
          </div>
        </section>
      )}

      {/* Features */}
      <section className="container grid gap-5 pb-24 md:grid-cols-3">
        {features.map((f) => (
          <div
            key={f.title}
            className="rounded-xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-primary">
              <f.icon className="h-5 w-5" />
            </div>
            <h3 className="font-semibold">{f.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
          </div>
        ))}
      </section>

      <footer className="border-t py-8">
        <div className="container text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} Your Company. AI customer support
          assistant.
        </div>
      </footer>

      {/* Live floating assistant */}
      <ChatWidget
        orgSlug={org.slug}
        botName={config.bot_name}
        welcomeMessage={config.welcome_message}
        suggestedQuestions={config.suggested_questions}
        primaryColor={config.primary_color}
        bookingUrl={config.booking_url}
      />
    </div>
  );
}
