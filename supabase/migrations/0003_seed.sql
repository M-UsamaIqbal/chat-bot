-- ============================================================================
-- Seed: the single-tenant organization + its chatbot config.
-- Safe to run multiple times (idempotent).
-- ============================================================================

insert into public.organizations (slug, name)
values ('support', 'Your Company')
on conflict (slug) do nothing;

insert into public.chatbot_config (organization_id, bot_name, welcome_message, booking_url)
select o.id,
       'AI Support Assistant',
       '👋 Hi! I''m your AI support assistant. Ask me about our products and services, or let me know if you''d like to talk to our team.',
       null
from public.organizations o
where o.slug = 'support'
on conflict (organization_id) do nothing;

-- ---------------------------------------------------------------------------
-- Grant a user admin access to your organization.
-- 1. Create the user first in Supabase Auth (Dashboard → Authentication → Add user,
--    or have them sign up at /admin/login).
-- 2. Then run the statement below, replacing the email, to link them:
--
--   insert into public.organization_members (organization_id, user_id, role)
--   select o.id, u.id, 'owner'
--   from public.organizations o, auth.users u
--   where o.slug = 'support' and u.email = 'admin@example.com'
--   on conflict (organization_id, user_id) do nothing;
--
-- Or simply run:  node scripts/create-admin.mjs  (does this for you).
-- ---------------------------------------------------------------------------
