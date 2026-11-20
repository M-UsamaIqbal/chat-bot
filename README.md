# AI Customer Support Chatbot

A production-ready, SaaS-architected, white-label AI customer-support assistant.
It answers from your verified company knowledge, captures leads, hands off to
humans, shares a booking link, and ships with a secure admin dashboard.

Built with **Next.js 15 (App Router)**, **TypeScript**, **Tailwind + shadcn-style UI**,
**Supabase (Postgres + Auth)**, and the **OpenAI Responses API**.

---

## ✨ Features

| Area | What's included |
|------|-----------------|
| **Chat widget** | Floating, responsive, streaming assistant · Roboto + `#5A24BA` branding · typing indicator · suggested questions · conversation history (localStorage) · embeddable on any site |
| **Knowledge base** | Add FAQs & service descriptions, import website URLs, upload text files (TXT/MD/CSV/JSON/HTML) — stored in Supabase and injected into the model's context so answers stay grounded (works on the free tier, no paid vector store) |
| **Grounded answers** | System prompt forbids inventing pricing/policies/services; escalates to a human when info is missing |
| **Lead capture** | AI collects name, email, optional phone, service interest & requirements · deduplicated by email · stored in Supabase |
| **Human handoff** | Detects "talk to a human" / frustration · saves handoff requests · dashboard resolve/reopen |
| **Booking** | Admin-configurable consultation URL · AI shares it but never claims a confirmed appointment |
| **Admin dashboard** | Secure Supabase auth · overview analytics · conversations · leads · knowledge management · chatbot settings · handoffs |
| **SaaS-ready** | Multi-tenant schema (everything scoped by `organization_id`) · Row Level Security · rate limiting · zod validation · server-only secrets |

---

## 🗂 Project structure

```
src/
  app/
    page.tsx                     Landing/demo page with live widget
    widget/page.tsx              Standalone embeddable widget (iframe target)
    embed/widget.js/route.ts     Loader script served to external sites
    admin/
      login/page.tsx             Admin sign-in
      (dashboard)/               Authenticated dashboard (sidebar layout)
        page.tsx                 Overview + analytics
        conversations/           List + transcript detail
        leads/                   Lead management
        knowledge/               Knowledge-base manager
        handoffs/                Human handoff queue
        settings/                Chatbot customization + embed snippet
    api/
      chat/route.ts              Streaming chat (Responses API + tools)
      leads/route.ts             Public lead capture (rate-limited)
      admin/...                  Protected admin APIs
  components/ui/                  shadcn-style primitives
  components/chat/                Widget, message bubble, typing indicator
  components/admin/               Dashboard components
  hooks/use-chat.ts              Client streaming chat hook
  lib/                           openai, supabase clients, prompts, validation,
                                 rate-limit, knowledge, leads, auth, org
supabase/migrations/             SQL: schema, RLS, seed
```

---

## 🚀 Getting started

### 1. Install

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Fill in `.env.local`. **Minimum for live AI answers:** a free **Groq** key
(`AI_API_KEY` + `AI_BASE_URL`). Full functionality (persistence, admin,
knowledge base) also needs the Supabase keys.

> The app runs in **demo mode** without these — the widget replies with a setup
> notice and nothing is persisted — so you can see the UI before wiring services.

#### Free AI (Groq — no credit card)

1. Go to **https://console.groq.com/keys**, sign in, and **Create API Key**.
2. Put it in `.env.local`:
   ```
   AI_API_KEY=gsk_your_groq_key
   AI_BASE_URL=https://api.groq.com/openai/v1
   AI_MODEL=llama-3.3-70b-versatile
   ```

Prefer OpenAI? Leave `AI_BASE_URL` empty, set `AI_API_KEY=sk-...` and
`AI_MODEL=gpt-4o-mini`. Any OpenAI-compatible provider (Gemini, Ollama,
OpenRouter) works by changing these three values.

| Variable | Where to get it | Exposed to browser? |
|----------|-----------------|---------------------|
| `AI_API_KEY` | console.groq.com/keys (free) or platform.openai.com | ❌ server only |
| `AI_BASE_URL` | `https://api.groq.com/openai/v1` for Groq; empty for OpenAI | ❌ |
| `AI_MODEL` | `llama-3.3-70b-versatile` (Groq) / `gpt-4o-mini` (OpenAI) | ❌ |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page | ✅ (RLS-protected) |
| `SUPABASE_SERVICE_ROLE_KEY` | same page — **full DB access** | ❌ server only |
| `NEXT_PUBLIC_APP_URL` | your deployed URL (localhost in dev) | ✅ |

### 3. Set up the database (Supabase)

1. Create a free project at [supabase.com](https://supabase.com) (no card needed).
2. In the project's **SQL Editor**, paste the entire contents of
   **`supabase/setup.sql`** and click **Run**. This creates all tables, Row Level
   Security, and the default organization in one step.
3. From **Project Settings → API**, copy the **Project URL**, **anon key**, and
   **service_role key** into `.env.local`.

### 4. Create your admin login

Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env.local`, then run:

```bash
npm run create-admin
```

This creates the auth user, links it to the organization as owner, and prints
your login credentials. (Re-running it just resets the password — safe to repeat.)

### 5. Run

```bash
npm run dev
```

- Landing + live widget: <http://localhost:3000>
- Admin dashboard: <http://localhost:3000/admin> (redirects to login)

---

## 🧪 Testing the app

1. **Chat (demo mode):** Without `OPENAI_API_KEY`, open the site and click the
   chat bubble — you'll get the demo-mode setup message, confirming the UI + stream work.
2. **Chat (live):** Add `OPENAI_API_KEY`, restart, and ask a question — responses stream token-by-token.
3. **Knowledge base:** In the dashboard → **Knowledge Base**, add a FAQ or service
   description. Then ask the widget about it — the answer is grounded in that content.
   Ask about something not in the KB (e.g. exact pricing) → it offers a human instead of inventing.
4. **Lead capture:** Tell the assistant you're interested and share a name + email →
   check **Leads** in the dashboard. Submit the same email again → it dedupes.
5. **Handoff:** Say "I want to talk to a human" → check **Handoffs**, mark it resolved.
6. **Booking:** Set a booking URL in **Settings** → ask to book a call → the AI shares the link.
7. **Embed:** Copy the snippet from **Settings** and paste it into any HTML page
   (see `public/embed-test.html` for a ready example).

---

## 🔒 Security notes

- **Secrets never reach the client** — only `NEXT_PUBLIC_*` vars are exposed; OpenAI
  and the Supabase service-role key are used only in server routes.
- **Row Level Security** restricts admin reads/writes to the caller's own organization.
- **Public writes** (chat, leads) go through validated, rate-limited server routes
  using the service role — visitors never touch the database directly.
- **Rate limiting** is in-memory (per instance). For multi-instance/serverless scale,
  swap `src/lib/rate-limit.ts` for Upstash Redis (same interface).
- **Input validation** via zod on every API boundary.

---

## ☁️ Deploy to Vercel

1. Push this repo to GitHub.
2. Import it in Vercel.
3. Add all environment variables from `.env.example` in the Vercel project settings.
4. Set `NEXT_PUBLIC_APP_URL` to your Vercel domain.
5. Deploy. Run the Supabase migrations against your production project.

---

## 🧭 Multi-tenant roadmap

The schema is already multi-tenant. To onboard more organizations later:
- Insert a new `organizations` row + `chatbot_config`.
- Add members via `organization_members`.
- Serve each tenant by `?org=<slug>` on the widget / `data-org` on the embed script.
- RLS + per-org vector stores keep knowledge and data isolated automatically.
