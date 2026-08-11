-- guest-chat-rls-migration.sql
-- ============================================================
-- FIX: Ananya AI guest chat was silently broken.
-- ------------------------------------------------------------
-- Problem: ananya_chat_sessions & ananya_chat_messages had RLS
-- policies ONLY for the `authenticated` role. Anonymous guests
-- (user_id NULL) could never INSERT/UPDATE — PostgREST returned
-- 401 "new row violates row-level security policy" on the
-- sessions upsert AND on every message insert. The app/site UI
-- invited guests to chat, but their sessions/messages were never
-- saved (console 401, admin panel showed no guest chats).
--
-- Fix: permissive `anon` policies that allow guests to manage
-- their own sessions (user_id IS NULL) and messages inside
-- guest sessions. Authenticated-user rows stay protected by the
-- existing owner/admin policies.
--
-- Applied via: supabase db query --linked (11 Aug 2026)

-- Guests can insert/select/update their own session rows (user_id NULL).
create policy ananya_sessions_guest_all
  on public.ananya_chat_sessions
  as permissive
  for all
  to anon
  using (user_id is null)
  with check (user_id is null);

-- Guests can insert/select messages under guest (user_id NULL) sessions.
create policy ananya_messages_guest_all
  on public.ananya_chat_messages
  as permissive
  for all
  to anon
  using (
    exists (
      select 1 from public.ananya_chat_sessions s
      where s.id = ananya_chat_messages.session_id
        and s.user_id is null
    )
  )
  with check (
    exists (
      select 1 from public.ananya_chat_sessions s
      where s.id = ananya_chat_messages.session_id
        and s.user_id is null
    )
  );
