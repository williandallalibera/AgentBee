import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { testOpenAiConnection } from "@/lib/integrations/openai";
import { sendGoogleChatMessage } from "@/lib/integrations/google-chat";
import { testLinkedInConnection } from "@/lib/integrations/linkedin";

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    provider?: "openai" | "google_chat" | "linkedin";
    webhook_url?: string;
    access_token?: string;
    organization_id?: string;
  };

  if (body.provider === "openai") {
    const r = await testOpenAiConnection();
    return NextResponse.json(r);
  }

  if (body.provider === "google_chat" && body.webhook_url) {
    const r = await sendGoogleChatMessage(body.webhook_url, {
      title: "Teste AgentBee",
      lines: ["Mensagem de teste da integração."],
    });
    return NextResponse.json(r);
  }

  if (body.provider === "linkedin") {
    const r = await testLinkedInConnection({
      accessToken: body.access_token ?? "",
      organizationId: body.organization_id,
    });
    return NextResponse.json(r);
  }

  return NextResponse.json({ error: "Invalid body" }, { status: 400 });
}
