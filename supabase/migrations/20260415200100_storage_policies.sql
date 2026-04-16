-- Políticas de Storage: paths {workspace_id}/...
CREATE POLICY "playbook_assets_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'playbook-assets'
    AND (storage.foldername (name))[1] IN (
      SELECT wm.workspace_id::text
      FROM public.workspace_members wm
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY "playbook_assets_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'playbook-assets'
    AND (storage.foldername (name))[1] IN (
      SELECT wm.workspace_id::text
      FROM public.workspace_members wm
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY "playbook_assets_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'playbook-assets'
    AND (storage.foldername (name))[1] IN (
      SELECT wm.workspace_id::text
      FROM public.workspace_members wm
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY "playbook_assets_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'playbook-assets'
    AND (storage.foldername (name))[1] IN (
      SELECT wm.workspace_id::text
      FROM public.workspace_members wm
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY "visual_drafts_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'visual-drafts'
    AND (storage.foldername (name))[1] IN (
      SELECT wm.workspace_id::text
      FROM public.workspace_members wm
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY "visual_drafts_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'visual-drafts'
    AND (storage.foldername (name))[1] IN (
      SELECT wm.workspace_id::text
      FROM public.workspace_members wm
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY "visual_drafts_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'visual-drafts'
    AND (storage.foldername (name))[1] IN (
      SELECT wm.workspace_id::text
      FROM public.workspace_members wm
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY "visual_drafts_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'visual-drafts'
    AND (storage.foldername (name))[1] IN (
      SELECT wm.workspace_id::text
      FROM public.workspace_members wm
      WHERE wm.user_id = auth.uid()
    )
  );
