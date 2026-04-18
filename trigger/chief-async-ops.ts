import { task } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import { sendGoogleChatMessage } from "../src/lib/integrations/google-chat";
import {
  executeCreateCampaignFromChief,
  executeGenerateCalendarFromChief,
  type CampaignDraftPayload,
  type GenerateCalendarParamsPayload,
} from "../src/lib/chief-agent/agent";

function serviceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export const chiefAsyncOps = task({
  id: "chief-async-ops",
  maxDuration: 900,
  run: async (payload: {
    workspaceId: string;
    operation: "create_campaign" | "generate_calendar";
    campaignDraft?: CampaignDraftPayload;
    generateParams?: GenerateCalendarParamsPayload;
    googleChatWebhook?: string | null;
    announcePrefix?: string | null;
  }) => {
    const supabase = serviceSupabase();
    let text = "";
    if (payload.operation === "create_campaign" && payload.campaignDraft) {
      text = await executeCreateCampaignFromChief(
        supabase,
        payload.workspaceId,
        payload.campaignDraft,
      );
    } else if (payload.operation === "generate_calendar" && payload.generateParams) {
      text = await executeGenerateCalendarFromChief(
        supabase,
        payload.workspaceId,
        payload.generateParams,
      );
    } else {
      text = "Operação assíncrona inválida ou payload incompleto.";
    }

    const head = payload.announcePrefix?.trim() ?? "Processamento em background concluído.";
    const body = `${head}\n\n${text}`.trim();
    const lines = body.split("\n").slice(0, 45);

    if (payload.googleChatWebhook?.trim()) {
      await sendGoogleChatMessage(payload.googleChatWebhook.trim(), {
        title: "Agente Chefe — atualização",
        lines,
      });
    }

    return { ok: true, operation: payload.operation };
  },
});
