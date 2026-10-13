-- Price memory learning curve for beta users.
-- Run in the Supabase SQL editor. Read-only.
-- Question: does the number of lines a contractor edits before sending go down
-- as they send more quotes? If yes, price memory is working.
--
-- Only quote_sent events that carry editedLineCount count. That metadata exists
-- only for AI-generated quotes sent after the price memory release.
-- A quote sent several times (resend, SMS then email) counts once, at its first send.

with first_sends as (
  select distinct on (user_id, coalesce(estimate_id::text, estimate_number, id::text))
    user_id,
    created_at,
    (metadata ->> 'editedLineCount')::int as edited_lines,
    nullif((metadata ->> 'priceMemoryEligibleLines')::int, 0) as eligible_lines
  from analytics_events
  where event_name = 'quote_sent'
    and metadata ? 'editedLineCount'
    and created_at >= now() - interval '90 days'
  order by user_id, coalesce(estimate_id::text, estimate_number, id::text), created_at
),
sequenced as (
  select
    *,
    row_number() over (partition by user_id order by created_at) as quote_number
  from first_sends
)

-- 1) Curve across all beta users, bucketed by the user's nth AI quote.
select
  case
    when quote_number = 1 then '01'
    when quote_number = 2 then '02'
    when quote_number = 3 then '03'
    when quote_number <= 5 then '04-05'
    when quote_number <= 10 then '06-10'
    else '11+'
  end as nth_quote,
  count(distinct user_id) as users,
  count(*) as quotes,
  round(avg(edited_lines), 2) as avg_edited_lines,
  round(avg(edited_lines::numeric / eligible_lines), 2) as avg_edited_share
from sequenced
group by 1
order by 1;

-- 2) Per user: first three AI quotes vs latest three. Needs at least 6 quotes.
-- Run this block separately.
with first_sends as (
  select distinct on (user_id, coalesce(estimate_id::text, estimate_number, id::text))
    user_id,
    created_at,
    (metadata ->> 'editedLineCount')::int as edited_lines
  from analytics_events
  where event_name = 'quote_sent'
    and metadata ? 'editedLineCount'
    and created_at >= now() - interval '90 days'
  order by user_id, coalesce(estimate_id::text, estimate_number, id::text), created_at
),
sequenced as (
  select
    *,
    row_number() over (partition by user_id order by created_at) as quote_number,
    count(*) over (partition by user_id) as total_quotes
  from first_sends
)
select
  user_id,
  max(total_quotes) as quotes,
  round(avg(edited_lines) filter (where quote_number <= 3), 2) as first_three_avg,
  round(avg(edited_lines) filter (where quote_number > total_quotes - 3), 2) as latest_three_avg
from sequenced
where total_quotes >= 6
group by user_id
order by quotes desc;
