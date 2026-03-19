alter table public.sms_messages
  add column if not exists idempotency_key text,
  add column if not exists last_error text;

create unique index if not exists idx_sms_messages_user_idempotency
  on public.sms_messages (user_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_sms_credit_ledger_user_created
  on public.sms_credit_ledger (user_id, created_at desc);

create or replace function public.claim_sms_send_credit(
  p_user_id uuid,
  p_estimate_id text,
  p_to_phone_e164 text,
  p_message text,
  p_idempotency_key text
)
returns table (
  message_row_id uuid,
  provider_id text,
  status text,
  credits_remaining int,
  deduped boolean,
  claimed boolean,
  last_error text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.sms_messages%rowtype;
  v_balance int;
begin
  if p_user_id is null then
    raise exception 'Unauthorized';
  end if;

  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'Missing idempotency key';
  end if;

  select *
    into v_existing
  from public.sms_messages
  where user_id = p_user_id
    and idempotency_key = p_idempotency_key
  limit 1;

  if found then
    select coalesce(sum(delta_credits), 0)::int
      into v_balance
    from public.sms_credit_ledger
    where user_id = p_user_id;

    message_row_id := v_existing.id;
    provider_id := v_existing.provider_id;
    status := coalesce(v_existing.status, 'pending');
    credits_remaining := coalesce(v_balance, 0);
    deduped := true;
    claimed := false;
    last_error := v_existing.last_error;
    return next;
    return;
  end if;

  select coalesce(sum(delta_credits), 0)::int
    into v_balance
  from public.sms_credit_ledger
  where user_id = p_user_id;

  if coalesce(v_balance, 0) <= 0 then
    message_row_id := null;
    provider_id := null;
    status := 'insufficient_credits';
    credits_remaining := coalesce(v_balance, 0);
    deduped := false;
    claimed := false;
    last_error := null;
    return next;
    return;
  end if;

  insert into public.sms_messages (
    user_id,
    estimate_id,
    to_phone_e164,
    provider_id,
    status,
    idempotency_key,
    last_error
  )
  values (
    p_user_id,
    p_estimate_id,
    p_to_phone_e164,
    null,
    'pending',
    p_idempotency_key,
    null
  )
  returning id
    into message_row_id;

  insert into public.sms_credit_ledger (
    user_id,
    delta_credits,
    reason,
    ref_id
  )
  values (
    p_user_id,
    -1,
    'send_sms',
    p_idempotency_key
  );

  provider_id := null;
  status := 'pending';
  credits_remaining := v_balance - 1;
  deduped := false;
  claimed := true;
  last_error := null;
  return next;
exception
  when unique_violation then
    select *
      into v_existing
    from public.sms_messages
    where user_id = p_user_id
      and idempotency_key = p_idempotency_key
    limit 1;

    select coalesce(sum(delta_credits), 0)::int
      into v_balance
    from public.sms_credit_ledger
    where user_id = p_user_id;

    message_row_id := v_existing.id;
    provider_id := v_existing.provider_id;
    status := coalesce(v_existing.status, 'pending');
    credits_remaining := coalesce(v_balance, 0);
    deduped := true;
    claimed := false;
    last_error := v_existing.last_error;
    return next;
end;
$$;

create or replace function public.finalize_sms_send_success(
  p_user_id uuid,
  p_message_row_id uuid,
  p_idempotency_key text,
  p_provider_id text,
  p_provider_status text
)
returns table (
  message_row_id uuid,
  provider_id text,
  status text,
  credits_remaining int
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance int;
begin
  update public.sms_messages
     set provider_id = p_provider_id,
         status = case
           when p_provider_status is null or btrim(p_provider_status) = '' then 'queued'
           else p_provider_status
         end,
         last_error = null
   where id = p_message_row_id
     and user_id = p_user_id
     and idempotency_key = p_idempotency_key;

  select coalesce(sum(delta_credits), 0)::int
    into v_balance
  from public.sms_credit_ledger
  where user_id = p_user_id;

  message_row_id := p_message_row_id;
  provider_id := p_provider_id;
  status := case
    when p_provider_status is null or btrim(p_provider_status) = '' then 'queued'
    else p_provider_status
  end;
  credits_remaining := coalesce(v_balance, 0);
  return next;
end;
$$;

create or replace function public.finalize_sms_send_failure(
  p_user_id uuid,
  p_message_row_id uuid,
  p_idempotency_key text,
  p_last_error text
)
returns table (
  message_row_id uuid,
  status text,
  credits_remaining int
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing_status text;
  v_balance int;
begin
  select status
    into v_existing_status
  from public.sms_messages
  where id = p_message_row_id
    and user_id = p_user_id
    and idempotency_key = p_idempotency_key
  limit 1;

  if v_existing_status is null then
    return;
  end if;

  if v_existing_status = 'pending' then
    update public.sms_messages
       set status = 'failed',
           last_error = left(coalesce(p_last_error, 'Failed to send SMS'), 500)
     where id = p_message_row_id
       and user_id = p_user_id
       and idempotency_key = p_idempotency_key;

    if not exists (
      select 1
      from public.sms_credit_ledger
      where user_id = p_user_id
        and reason = 'send_sms_refund'
        and ref_id = p_idempotency_key || ':refund'
    ) then
      insert into public.sms_credit_ledger (
        user_id,
        delta_credits,
        reason,
        ref_id
      )
      values (
        p_user_id,
        1,
        'send_sms_refund',
        p_idempotency_key || ':refund'
      );
    end if;
  end if;

  select coalesce(sum(delta_credits), 0)::int
    into v_balance
  from public.sms_credit_ledger
  where user_id = p_user_id;

  message_row_id := p_message_row_id;
  status := case
    when v_existing_status = 'pending' then 'failed'
    else v_existing_status
  end;
  credits_remaining := coalesce(v_balance, 0);
  return next;
end;
$$;

grant execute on function public.claim_sms_send_credit(uuid, text, text, text, text) to authenticated;
grant execute on function public.finalize_sms_send_success(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.finalize_sms_send_failure(uuid, uuid, text, text) to authenticated;
