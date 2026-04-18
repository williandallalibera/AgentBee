-- Artes modelo / referências visuais para o agente de criação (storage: playbook-assets/{workspace_id}/refs/...)

CREATE TABLE public.playbook_visual_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Referência visual',
  notes TEXT,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_playbook_visual_refs_ws ON public.playbook_visual_references (workspace_id);

ALTER TABLE public.playbook_visual_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY "playbook_visual_refs_all"
  ON public.playbook_visual_references FOR ALL
  USING (workspace_id IN (SELECT public.user_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT public.user_workspace_ids()));
