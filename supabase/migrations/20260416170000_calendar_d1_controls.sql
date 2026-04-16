-- Calendario editorial operacional + controles D-1

ALTER TABLE public.calendar_items
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces (id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS content_task_id UUID REFERENCES public.content_tasks (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS topic_title TEXT,
  ADD COLUMN IF NOT EXISTS topic_brief TEXT,
  ADD COLUMN IF NOT EXISTS d1_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS blocked_reason TEXT,
  ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ;

UPDATE public.calendar_items ci
SET workspace_id = b.workspace_id
FROM public.campaigns c
JOIN public.brands b ON b.id = c.brand_id
WHERE ci.campaign_id = c.id
  AND ci.workspace_id IS NULL;

ALTER TABLE public.calendar_items
  ALTER COLUMN workspace_id SET NOT NULL;

UPDATE public.calendar_items
SET status = CASE
  WHEN status = 'in_progress' THEN 'awaiting_approval'
  WHEN status = 'done' THEN 'published'
  ELSE status
END;

ALTER TABLE public.calendar_items
  DROP CONSTRAINT IF EXISTS calendar_items_status_check;

ALTER TABLE public.calendar_items
  ADD CONSTRAINT calendar_items_status_check
  CHECK (
    status IN (
      'planned',
      'awaiting_approval',
      'approved',
      'blocked',
      'rescheduled',
      'published',
      'cancelled'
    )
  );

CREATE INDEX IF NOT EXISTS idx_calendar_items_workspace_planned_date
  ON public.calendar_items (workspace_id, planned_date);

CREATE INDEX IF NOT EXISTS idx_calendar_items_campaign_planned_date
  ON public.calendar_items (campaign_id, planned_date);

CREATE INDEX IF NOT EXISTS idx_calendar_items_status
  ON public.calendar_items (status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_calendar_items_content_task
  ON public.calendar_items (content_task_id)
  WHERE content_task_id IS NOT NULL;

ALTER TABLE public.publications
  ADD COLUMN IF NOT EXISTS blocked_by_d1 BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS d1_blocked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS d1_last_reminder_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS d1_reminder_count INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_publications_d1
  ON public.publications (blocked_by_d1, status);
