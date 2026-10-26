-- Payment state (status, payment_completed_at, payment link) is decided by the server (Stripe webhook/reconcile,
-- completion finalize), but clients still make legit offline transitions (send, Mark as paid, new payment link)
-- through the LWW upsert. Each client write carries the payment_state_version it last pulled; a stale one
-- (the server moved the payment state since) keeps the stored payment state and only the rest of the row lands.
alter table public.estimates
  add column if not exists payment_state_version integer not null default 0;

create or replace function public.guard_estimate_payment_state()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.status, new.payment_completed_at, new.payment_link, new.payment_link_id, new.payment_link_type)
    is not distinct from
    (old.status, old.payment_completed_at, old.payment_link, old.payment_link_id, old.payment_link_type)
  then
    new.payment_state_version := old.payment_state_version;
    return new;
  end if;

  -- PostgREST runs client requests as `authenticated`; server routes use service_role and always win.
  if current_user = 'authenticated' and new.payment_state_version is distinct from old.payment_state_version then
    new.status := old.status;
    new.sent_at := old.sent_at;
    new.payment_completed_at := old.payment_completed_at;
    new.payment_link := old.payment_link;
    new.payment_link_id := old.payment_link_id;
    new.payment_link_type := old.payment_link_type;
    new.payment_state_version := old.payment_state_version;
    return new;
  end if;

  new.payment_state_version := old.payment_state_version + 1;
  return new;
end;
$$;

drop trigger if exists guard_estimate_payment_state on public.estimates;
create trigger guard_estimate_payment_state
  before update on public.estimates
  for each row execute function public.guard_estimate_payment_state();
