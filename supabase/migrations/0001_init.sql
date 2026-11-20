-- ============================================================================
-- AI Support Chatbot — Initial schema (multi-tenant ready)
-- Run in the Supabase SQL editor (or via `supabase db push`).
-- Every tenant-scoped table carries organization_id so the single-tenant
-- launch can grow into full multi-tenant SaaS without a migration.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Organizations (tenants)
-- ---------------------------------------------------------------------------
create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  created_at  timestamptz not null default now()
);

-- Members link Supabase auth users to an organization with a role.
create table if not exists public.organization_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            text not null default 'admin' check (role in ('owner','admin','agent')),
  created_at      timestamptz not null default now(),
  unique (organization_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Chatbot configuration (one row per organization)
-- ---------------------------------------------------------------------------
create table if not exists public.chatbot_config (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null unique references public.organizations(id) on delete cascade,
  bot_name             text not null default 'AI Support Assistant',
  welcome_message      text not null default '👋 Hi! I''m your AI support assistant. How can I help?',
  suggested_questions  text[] not null default array[
                         'What services do you offer?',
                         'How do I get started?',
                         'Can I book a consultation?',
                         'I''d like to speak with a human.'
                       ],
  primary_color        text not null default '#5A24BA',
  booking_url          text,
  human_handoff_enabled boolean not null default true,
  lead_capture_enabled  boolean not null default true,
  vector_store_id       text,
  updated_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Knowledge base documents (files, FAQs, URLs, raw text)
-- ---------------------------------------------------------------------------
create table if not exists public.knowledge_documents (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title           text not null,
  source_type     text not null default 'text' check (source_type in ('file','faq','url','text')),
  content         text,
  url             text,
  openai_file_id  text,
  status          text not null default 'pending' check (status in ('pending','indexed','failed')),
  created_at      timestamptz not null default now()
);
create index if not exists idx_knowledge_org on public.knowledge_documents(organization_id);

-- ---------------------------------------------------------------------------
-- Conversations + messages
-- ---------------------------------------------------------------------------
create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  session_id      text not null,
  visitor_name    text,
  status          text not null default 'active' check (status in ('active','handoff_requested','resolved')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, session_id)
);
create index if not exists idx_conv_org on public.conversations(organization_id);

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role            text not null check (role in ('user','assistant','system')),
  content         text not null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_msg_conv on public.messages(conversation_id);

-- ---------------------------------------------------------------------------
-- Leads (deduplicated per organization by email)
-- ---------------------------------------------------------------------------
create table if not exists public.leads (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  conversation_id   uuid references public.conversations(id) on delete set null,
  name              text not null,
  email             text not null,
  phone             text,
  service_interest  text,
  requirements      text,
  status            text not null default 'new' check (status in ('new','contacted','qualified','closed')),
  created_at        timestamptz not null default now(),
  unique (organization_id, email)
);
create index if not exists idx_leads_org on public.leads(organization_id);

-- ---------------------------------------------------------------------------
-- Human handoff requests
-- ---------------------------------------------------------------------------
create table if not exists public.handoff_requests (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  reason          text,
  status          text not null default 'pending' check (status in ('pending','resolved')),
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz
);
create index if not exists idx_handoff_org on public.handoff_requests(organization_id);

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists trg_conv_updated on public.conversations;
create trigger trg_conv_updated before update on public.conversations
  for each row execute function public.set_updated_at();

drop trigger if exists trg_cfg_updated on public.chatbot_config;
create trigger trg_cfg_updated before update on public.chatbot_config
  for each row execute function public.set_updated_at();
