-- Consolidar modelo de acesso para papel unico: admin
UPDATE public.workspace_members
SET role = 'admin'
WHERE role <> 'admin';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'workspace_members_role_check'
  ) THEN
    ALTER TABLE public.workspace_members
      DROP CONSTRAINT workspace_members_role_check;
  END IF;
END $$;

ALTER TABLE public.workspace_members
  ADD CONSTRAINT workspace_members_role_check
  CHECK (role = 'admin');
