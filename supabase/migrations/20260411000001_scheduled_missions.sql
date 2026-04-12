-- Scheduled missions table for server-side cron execution
-- Missions fire even when the browser is closed

create table if not exists public.scheduled_missions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  agent_id uuid references public.user_agents(id) on delete set null,
  agent_name text,
  priority text default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  cron_expression text not null,
  enabled boolean default true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Index for the cron checker to find due missions
create index if not exists idx_sched_missions_due
  on public.scheduled_missions (enabled, next_run_at)
  where enabled = true;

-- Index by user
create index if not exists idx_sched_missions_user
  on public.scheduled_missions (user_id);

-- RLS
alter table public.scheduled_missions enable row level security;

create policy "Users can manage their own scheduled missions"
  on public.scheduled_missions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Function to calculate next run time from a cron expression
-- Called by pg_cron or a periodic edge function
create or replace function public.fire_due_missions()
returns void
language plpgsql
security definer
as $$
declare
  sched record;
begin
  for sched in
    select * from public.scheduled_missions
    where enabled = true
      and next_run_at is not null
      and next_run_at <= now()
  loop
    -- Create a task for this scheduled mission
    insert into public.tasks (user_id, title, status, priority, agent_id, agent_name, progress, metadata, created_at, updated_at)
    values (
      sched.user_id,
      sched.title,
      'queued',
      sched.priority,
      sched.agent_id,
      sched.agent_name,
      0,
      jsonb_build_object(
        'scheduled', true,
        'schedule_id', sched.id,
        'cron', sched.cron_expression
      ),
      now(),
      now()
    );

    -- Update last_run_at (next_run_at should be recalculated by app or cron helper)
    update public.scheduled_missions
    set last_run_at = now(),
        next_run_at = null, -- recalculated by client or cron helper
        updated_at = now()
    where id = sched.id;
  end loop;
end;
$$;

-- pg_cron job (requires pg_cron extension enabled on Supabase Pro)
-- Uncomment when pg_cron is available:
-- select cron.schedule('fire-scheduled-missions', '* * * * *', 'select public.fire_due_missions()');
