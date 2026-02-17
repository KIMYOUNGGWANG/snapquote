-- Harden referral_events insert surface while preserving anonymous tracking.
-- Supabase RLS best-practice: restrict "public insert" policies with tight WITH CHECK predicates.

alter table referral_events
  add constraint referral_events_event_name_check
  check (event_name in ('landing_visit', 'quote_share_click', 'signup_start')) not valid;

alter table referral_events
  add constraint referral_events_token_format_check
  check (token ~ '^[a-z0-9]{8,32}$') not valid;

alter table referral_events
  add constraint referral_events_source_length_check
  check (source is null or char_length(source) <= 40) not valid;

alter table referral_events
  add constraint referral_events_metadata_size_check
  check (pg_column_size(metadata) <= 4096) not valid;

drop policy if exists "Anyone can insert referral events" on referral_events;

create policy "Anyone can insert referral events"
  on referral_events
  for insert
  with check (
    token ~ '^[a-z0-9]{8,32}$'
    and event_name in ('landing_visit', 'quote_share_click', 'signup_start')
    and (source is null or char_length(source) <= 40)
    and pg_column_size(metadata) <= 4096
  );
