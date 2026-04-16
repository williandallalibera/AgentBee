-- Kolmena AgentBee — schema inicial (SDD)
-- Habilitar extensões
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Perfis (espelho de auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role = 'admin'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, user_id)
);

CREATE TABLE public.brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  tone_of_voice TEXT,
  visual_guidelines_json JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.playbook_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'general',
  content_markdown TEXT NOT NULL DEFAULT '',
  tags_json JSONB DEFAULT '[]'::JSONB,
  version_number INT NOT NULL DEFAULT 1,
  created_by UUID REFERENCES auth.users (id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.brands (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  objective TEXT,
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'active', 'paused', 'completed', 'cancelled')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.calendar_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns (id) ON DELETE CASCADE,
  planned_date DATE NOT NULL,
  channel_type TEXT NOT NULL DEFAULT 'instagram',
  format_type TEXT,
  objective_type TEXT,
  topic TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (
    status IN ('planned', 'in_progress', 'done', 'cancelled')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  avatar_url TEXT,
  role TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT 'marketing',
  autonomy_level INT NOT NULL DEFAULT 1 CHECK (autonomy_level BETWEEN 0 AND 3),
  instructions_markdown TEXT,
  tools_json JSONB DEFAULT '[]'::JSONB,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.content_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.campaigns (id) ON DELETE SET NULL,
  calendar_item_id UUID REFERENCES public.calendar_items (id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'social_post',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN (
      'draft',
      'researching',
      'planning',
      'awaiting_initial_approval',
      'creating',
      'awaiting_final_approval',
      'in_revision',
      'approved',
      'scheduled',
      'published',
      'error',
      'cancelled'
    )
  ),
  requested_by UUID REFERENCES auth.users (id),
  due_at TIMESTAMPTZ,
  current_stage TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.content_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.content_tasks (id) ON DELETE CASCADE,
  proposal_number INT NOT NULL DEFAULT 1,
  summary_markdown TEXT NOT NULL DEFAULT '',
  strategy_json JSONB DEFAULT '{}'::JSONB,
  research_summary_json JSONB DEFAULT '{}'::JSONB,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN (
      'draft',
      'pending_approval',
      'approved',
      'rejected',
      'superseded'
    )
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.content_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.content_tasks (id) ON DELETE CASCADE,
  version_number INT NOT NULL DEFAULT 1,
  copy_markdown TEXT,
  carousel_structure_json JSONB,
  visual_draft_url TEXT,
  video_draft_url TEXT,
  model_metadata_json JSONB,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'pending_final', 'approved', 'superseded')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.content_tasks (id) ON DELETE CASCADE,
  approval_type TEXT NOT NULL CHECK (
    approval_type IN ('initial_summary', 'final_delivery')
  ),
  target_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'approved', 'rejected', 'cancelled')
  ),
  approver_user_id UUID REFERENCES auth.users (id),
  channel_type TEXT CHECK (channel_type IN ('google_chat', 'email', 'web')),
  sent_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  comments TEXT,
  wait_token_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES public.agents (id) ON DELETE SET NULL,
  task_id UUID REFERENCES public.content_tasks (id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (
    status IN ('running', 'success', 'error', 'skipped')
  ),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  input_summary TEXT,
  output_summary TEXT,
  cost_estimate NUMERIC(12, 4),
  error_message TEXT
);

CREATE TABLE public.chief_agent_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  external_channel TEXT NOT NULL DEFAULT 'google_chat',
  external_thread_id TEXT,
  user_id UUID REFERENCES auth.users (id),
  message_text TEXT NOT NULL,
  intent TEXT,
  response_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (
    provider IN (
      'openai',
      'google_chat',
      'google_workspace',
      'instagram',
      'linkedin'
    )
  ),
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (
    status IN ('connected', 'disconnected', 'error', 'disabled')
  ),
  config_metadata_json JSONB DEFAULT '{}'::JSONB,
  last_tested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, provider)
);

CREATE TABLE public.publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.content_tasks (id) ON DELETE CASCADE,
  channel_type TEXT NOT NULL DEFAULT 'instagram',
  external_account_id TEXT,
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  external_post_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'scheduled', 'published', 'failed', 'cancelled', 'disabled')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces (id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  action TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'system', 'agent')),
  actor_id TEXT,
  metadata_json JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_workspace_members_user ON public.workspace_members (user_id);
CREATE INDEX idx_workspace_members_ws ON public.workspace_members (workspace_id);
CREATE INDEX idx_content_tasks_ws ON public.content_tasks (workspace_id);
CREATE INDEX idx_content_tasks_status ON public.content_tasks (status);
CREATE INDEX idx_approvals_task ON public.approvals (task_id);
CREATE INDEX idx_agent_runs_task ON public.agent_runs (task_id);
CREATE INDEX idx_audit_ws ON public.audit_logs (workspace_id);
CREATE INDEX idx_audit_created ON public.audit_logs (created_at DESC);

-- Trigger updated_at em content_tasks
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_content_tasks_updated
BEFORE UPDATE ON public.content_tasks
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tr_playbook_updated
BEFORE UPDATE ON public.playbook_documents
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Novo usuário → profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playbook_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chief_agent_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper: memberships do usuário
CREATE OR REPLACE FUNCTION public.user_workspace_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT workspace_id
  FROM public.workspace_members
  WHERE user_id = auth.uid();
$$;

-- Policies: profiles
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid());

-- Workspaces: membros veem
CREATE POLICY "workspaces_select_member"
  ON public.workspaces FOR SELECT
  USING (id IN (SELECT public.user_workspace_ids()));

CREATE POLICY "workspaces_insert_authenticated"
  ON public.workspaces FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "workspaces_update_admin"
  ON public.workspaces FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspaces.id
        AND wm.user_id = auth.uid()
        AND wm.role = 'admin'
    )
  );

-- workspace_members
CREATE POLICY "wm_select"
  ON public.workspace_members FOR SELECT
  USING (workspace_id IN (SELECT public.user_workspace_ids()));

CREATE POLICY "wm_insert_admin"
  ON public.workspace_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_members.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'admin'
    )
    OR NOT EXISTS (
      SELECT 1 FROM public.workspace_members wm2
      WHERE wm2.workspace_id = workspace_members.workspace_id
    )
  );

CREATE POLICY "wm_update_admin"
  ON public.workspace_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_members.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'admin'
    )
  );

-- Genérico por workspace_id
CREATE POLICY "brands_all"
  ON public.brands FOR ALL
  USING (workspace_id IN (SELECT public.user_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT public.user_workspace_ids()));

CREATE POLICY "playbook_all"
  ON public.playbook_documents FOR ALL
  USING (workspace_id IN (SELECT public.user_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT public.user_workspace_ids()));

CREATE POLICY "agents_all"
  ON public.agents FOR ALL
  USING (workspace_id IN (SELECT public.user_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT public.user_workspace_ids()));

CREATE POLICY "integrations_all"
  ON public.integrations FOR ALL
  USING (workspace_id IN (SELECT public.user_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT public.user_workspace_ids()));

CREATE POLICY "chief_conv_all"
  ON public.chief_agent_conversations FOR ALL
  USING (workspace_id IN (SELECT public.user_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT public.user_workspace_ids()));

CREATE POLICY "audit_select"
  ON public.audit_logs FOR SELECT
  USING (
    workspace_id IS NULL
    OR workspace_id IN (SELECT public.user_workspace_ids())
  );

CREATE POLICY "content_tasks_all"
  ON public.content_tasks FOR ALL
  USING (workspace_id IN (SELECT public.user_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT public.user_workspace_ids()));

-- campaigns via brand
CREATE POLICY "campaigns_all"
  ON public.campaigns FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.brands b
      WHERE b.id = campaigns.brand_id
        AND b.workspace_id IN (SELECT public.user_workspace_ids())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.brands b
      WHERE b.id = campaigns.brand_id
        AND b.workspace_id IN (SELECT public.user_workspace_ids())
    )
  );

CREATE POLICY "calendar_all"
  ON public.calendar_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      JOIN public.brands b ON b.id = c.brand_id
      WHERE c.id = calendar_items.campaign_id
        AND b.workspace_id IN (SELECT public.user_workspace_ids())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      JOIN public.brands b ON b.id = c.brand_id
      WHERE c.id = calendar_items.campaign_id
        AND b.workspace_id IN (SELECT public.user_workspace_ids())
    )
  );

CREATE POLICY "content_proposals_all"
  ON public.content_proposals FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.content_tasks t
      WHERE t.id = content_proposals.task_id
        AND t.workspace_id IN (SELECT public.user_workspace_ids())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.content_tasks t
      WHERE t.id = content_proposals.task_id
        AND t.workspace_id IN (SELECT public.user_workspace_ids())
    )
  );

CREATE POLICY "content_versions_all"
  ON public.content_versions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.content_tasks t
      WHERE t.id = content_versions.task_id
        AND t.workspace_id IN (SELECT public.user_workspace_ids())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.content_tasks t
      WHERE t.id = content_versions.task_id
        AND t.workspace_id IN (SELECT public.user_workspace_ids())
    )
  );

CREATE POLICY "approvals_all"
  ON public.approvals FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.content_tasks t
      WHERE t.id = approvals.task_id
        AND t.workspace_id IN (SELECT public.user_workspace_ids())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.content_tasks t
      WHERE t.id = approvals.task_id
        AND t.workspace_id IN (SELECT public.user_workspace_ids())
    )
  );

CREATE POLICY "agent_runs_all"
  ON public.agent_runs FOR ALL
  USING (
    task_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.content_tasks t
      WHERE t.id = agent_runs.task_id
        AND t.workspace_id IN (SELECT public.user_workspace_ids())
    )
  )
  WITH CHECK (
    task_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.content_tasks t
      WHERE t.id = agent_runs.task_id
        AND t.workspace_id IN (SELECT public.user_workspace_ids())
    )
  );

CREATE POLICY "publications_all"
  ON public.publications FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.content_tasks t
      WHERE t.id = publications.task_id
        AND t.workspace_id IN (SELECT public.user_workspace_ids())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.content_tasks t
      WHERE t.id = publications.task_id
        AND t.workspace_id IN (SELECT public.user_workspace_ids())
    )
  );

-- Storage buckets (políticas aplicadas no dashboard ou migração storage)
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('playbook-assets', 'playbook-assets', FALSE),
  ('visual-drafts', 'visual-drafts', FALSE)
ON CONFLICT (id) DO NOTHING;
