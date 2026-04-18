-- Resumo de threads do Agente Chefe + metadados de publicação/arte

CREATE TABLE IF NOT EXISTS public.chief_thread_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  external_channel TEXT NOT NULL DEFAULT 'google_chat',
  external_thread_id TEXT NOT NULL DEFAULT '',
  summary_text TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, external_channel, external_thread_id)
);

CREATE INDEX IF NOT EXISTS idx_chief_thread_summaries_workspace
  ON public.chief_thread_summaries (workspace_id);

ALTER TABLE public.publications
  ADD COLUMN IF NOT EXISTS media_urls_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS last_error TEXT;

ALTER TABLE public.agent_runs
  ADD COLUMN IF NOT EXISTS input_json JSONB,
  ADD COLUMN IF NOT EXISTS output_json JSONB;

INSERT INTO storage.buckets (id, name, public)
VALUES ('social-assets', 'social-assets', TRUE)
ON CONFLICT (id) DO NOTHING;
