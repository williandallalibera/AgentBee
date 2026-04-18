-- workspace_id denormalizado (filtros Realtime) + colunas de agendamento/retry em publications

ALTER TABLE public.approvals
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces (id) ON DELETE CASCADE;

UPDATE public.approvals AS a
SET workspace_id = t.workspace_id
FROM public.content_tasks AS t
WHERE t.id = a.task_id
  AND a.workspace_id IS NULL;

ALTER TABLE public.approvals
  ALTER COLUMN workspace_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_approvals_workspace_pending
  ON public.approvals (workspace_id)
  WHERE status = 'pending';

ALTER TABLE public.publications
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces (id) ON DELETE CASCADE;

UPDATE public.publications AS p
SET workspace_id = t.workspace_id
FROM public.content_tasks AS t
WHERE t.id = p.task_id
  AND p.workspace_id IS NULL;

ALTER TABLE public.publications
  ALTER COLUMN workspace_id SET NOT NULL;

ALTER TABLE public.publications
  ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scheduled_trigger_run_id TEXT;

CREATE INDEX IF NOT EXISTS idx_publications_pending_schedule
  ON public.publications (status, scheduled_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_publications_workspace  ON public.publications (workspace_id);

ALTER TABLE public.agent_runs
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces (id) ON DELETE SET NULL;

UPDATE public.agent_runs AS r
SET workspace_id = t.workspace_id
FROM public.content_tasks AS t
WHERE t.id = r.task_id
  AND r.workspace_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_agent_runs_workspace ON public.agent_runs (workspace_id);

-- Supabase Realtime (ignorar se já estiver na publication)
ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.approvals;
ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.publications;
ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.agent_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.calendar_items;
ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.content_tasks;
