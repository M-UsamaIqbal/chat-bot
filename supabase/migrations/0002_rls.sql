-- ============================================================================
-- Row Level Security
-- Visitors NEVER hit these tables directly — all public writes go through the
-- server using the service-role key (which bypasses RLS). RLS here governs the
-- authenticated admin dashboard: a user may only touch rows for organizations
-- they are a member of.
-- ============================================================================

-- Helper: is the current auth user a member of the given organization?
create or replace function public.is_org_member(org uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org
      and m.user_id = auth.uid()
  );
$$;

-- Enable RLS everywhere.
alter table public.organizations        enable row level security;
alter table public.organization_members enable row level security;
alter table public.chatbot_config       enable row level security;
alter table public.knowledge_documents  enable row level security;
alter table public.conversations        enable row level security;
alter table public.messages             enable row level security;
alter table public.leads                enable row level security;
alter table public.handoff_requests     enable row level security;

-- Organizations: members can read their own org.
drop policy if exists org_select on public.organizations;
create policy org_select on public.organizations
  for select using (public.is_org_member(id));

-- Organization members: a user can see membership rows for their orgs.
drop policy if exists members_select on public.organization_members;
create policy members_select on public.organization_members
  for select using (public.is_org_member(organization_id));

-- Generic member-scoped policies (full CRUD for members) ---------------------
drop policy if exists cfg_all on public.chatbot_config;
create policy cfg_all on public.chatbot_config
  for all using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists kb_all on public.knowledge_documents;
create policy kb_all on public.knowledge_documents
  for all using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists conv_all on public.conversations;
create policy conv_all on public.conversations
  for all using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists msg_all on public.messages;
create policy msg_all on public.messages
  for all using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists leads_all on public.leads;
create policy leads_all on public.leads
  for all using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists handoff_all on public.handoff_requests;
create policy handoff_all on public.handoff_requests
  for all using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
