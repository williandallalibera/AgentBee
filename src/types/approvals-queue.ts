export type ApprovalsQueueRow = {
  id: string;
  approval_type: string;
  status: string;
  task_id: string;
  created_at: string;
  task?: {
    id: string;
    title: string;
    status: string;
    campaign_id?: string | null;
    campaign?: { id: string; name: string } | null;
  };
};
