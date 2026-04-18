"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateIntegration } from "@/actions/integrations";

type InitialConfigs = Record<string, Record<string, unknown>>;

export function IntegrationForms({
  localMode = false,
  initialConfigs = {},
  googleChatEndpointBase,
  googleChatLegacyEndpoint,
  googleChatLegacyTokenConfigured = false,
}: {
  localMode?: boolean;
  initialConfigs?: InitialConfigs;
  googleChatEndpointBase?: string;
  googleChatLegacyEndpoint?: string;
  googleChatLegacyTokenConfigured?: boolean;
}) {
  const router = useRouter();
  const [openAiApiKey, setOpenAiApiKey] = useState(
    String(initialConfigs.openai?.api_key ?? ""),
  );
  const [openAiModel, setOpenAiModel] = useState(
    String(initialConfigs.openai?.model ?? "gpt-4o-mini"),
  );
  const [chatUrl, setChatUrl] = useState(
    String(initialConfigs.google_chat?.webhook_url ?? ""),
  );
  const [chatBotEndpoint, setChatBotEndpoint] = useState(
    String(initialConfigs.google_chat?.bot_endpoint_url ?? googleChatLegacyEndpoint ?? ""),
  );
  const [instagramUserId, setInstagramUserId] = useState(
    String(initialConfigs.instagram?.ig_user_id ?? ""),
  );
  const [instagramAccessToken, setInstagramAccessToken] = useState(
    String(initialConfigs.instagram?.access_token ?? ""),
  );
  const [linkedinOrgId, setLinkedinOrgId] = useState(
    String(initialConfigs.linkedin?.organization_id ?? ""),
  );
  const [linkedinAccessToken, setLinkedinAccessToken] = useState(
    String(initialConfigs.linkedin?.access_token ?? ""),
  );
  const [workspaceServiceEmail, setWorkspaceServiceEmail] = useState(
    String(initialConfigs.google_workspace?.service_account_email ?? ""),
  );
  const [workspaceDelegatedUser, setWorkspaceDelegatedUser] = useState(
    String(initialConfigs.google_workspace?.delegated_admin_email ?? ""),
  );
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const effectiveGoogleChatEndpointBase =
    googleChatEndpointBase || "https://seu-app-host/api/webhooks/google-chat";
  const effectiveGoogleChatLegacyEndpoint =
    googleChatLegacyEndpoint ||
    "https://seu-app-host/api/webhooks/google-chat?token=<GOOGLE_CHAT_VERIFICATION_TOKEN>";
  const effectiveConfiguredChatBotEndpoint =
    chatBotEndpoint.trim() || effectiveGoogleChatLegacyEndpoint;

  async function saveOpenAi() {
    if (localMode) {
      setMsg("Modo local: configuração desabilitada.");
      return;
    }
    setSaving(true);
    setMsg(null);
    const r = await updateIntegration({
      provider: "openai",
      status: "connected",
      config: {
        api_key: openAiApiKey,
        model: openAiModel,
      },
    });
    setMsg("error" in r && r.error ? r.error : "OpenAI salvo.");
    setSaving(false);
    router.refresh();
  }

  async function saveChat() {
    if (localMode) {
      setMsg("Modo local: configuração desabilitada.");
      return;
    }
    setSaving(true);
    setMsg(null);
    const r = await updateIntegration({
      provider: "google_chat",
      status: "connected",
      config: {
        ...(initialConfigs.google_chat ?? {}),
        bot_endpoint_url: effectiveConfiguredChatBotEndpoint,
        webhook_url: chatUrl,
      },
    });
    setMsg("error" in r && r.error ? r.error : "Salvo.");
    setSaving(false);
    router.refresh();
  }

  async function saveInstagram() {
    if (localMode) {
      setMsg("Modo local: configuração desabilitada.");
      return;
    }
    setSaving(true);
    setMsg(null);
    const r = await updateIntegration({
      provider: "instagram",
      status: "connected",
      config: {
        ig_user_id: instagramUserId,
        access_token: instagramAccessToken,
      },
    });
    setMsg("error" in r && r.error ? r.error : "Instagram salvo.");
    setSaving(false);
    router.refresh();
  }

  async function saveLinkedIn() {
    if (localMode) {
      setMsg("Modo local: configuração desabilitada.");
      return;
    }
    setSaving(true);
    setMsg(null);
    const r = await updateIntegration({
      provider: "linkedin",
      status: "connected",
      config: {
        organization_id: linkedinOrgId,
        access_token: linkedinAccessToken,
      },
    });
    setMsg("error" in r && r.error ? r.error : "LinkedIn salvo.");
    setSaving(false);
    router.refresh();
  }

  async function saveGoogleWorkspace() {
    if (localMode) {
      setMsg("Modo local: configuração desabilitada.");
      return;
    }
    setSaving(true);
    setMsg(null);
    const r = await updateIntegration({
      provider: "google_workspace",
      status: "connected",
      config: {
        service_account_email: workspaceServiceEmail,
        delegated_admin_email: workspaceDelegatedUser,
      },
    });
    setMsg("error" in r && r.error ? r.error : "Google Workspace salvo.");
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4 rounded border border-gray-200 p-4 dark:border-gray-700">
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-900 dark:text-white">OpenAI</p>
          <Label htmlFor="openai-key">API Key</Label>
          <Input
            id="openai-key"
            type="password"
            value={openAiApiKey}
            onChange={(e) => setOpenAiApiKey(e.target.value)}
            placeholder="sk-..."
            disabled={localMode}
          />
          <Label htmlFor="openai-model">Modelo</Label>
          <Input
            id="openai-model"
            value={openAiModel}
            onChange={(e) => setOpenAiModel(e.target.value)}
            placeholder="gpt-4o-mini"
            disabled={localMode}
          />
          <Button type="button" onClick={saveOpenAi} disabled={localMode || saving}>
            Salvar OpenAI
          </Button>
        </div>
      </div>

      <div className="space-y-4 rounded border border-gray-200 p-4 dark:border-gray-700">
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-900 dark:text-white">Google Chat</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            O modo padrão desta fase usa token de verificação no endpoint do bot. Configure esse
            endpoint no app do Google Chat. O webhook do espaço abaixo é opcional e serve só para
            alertas enviados pelo AgentBee.
          </p>
          <details className="rounded-md border border-gray-200 bg-muted/40 p-3 text-xs dark:border-gray-600">
            <summary className="cursor-pointer font-medium text-gray-900 dark:text-white">
              Não está funcionando? Veja qual situação é a sua (A, B ou C)
            </summary>
            <ul className="mt-2 list-disc space-y-2 pl-4 text-gray-600 dark:text-gray-300">
              <li>
                <strong>A — O bot não responde no Chat</strong> (nem erro visível): confira no Google
                Cloud se a URL do app bate com o deploy, se o{" "}
                <code className="rounded bg-muted px-1">?token=</code> é o valor completo de{" "}
                <code className="rounded bg-muted px-1">GOOGLE_CHAT_VERIFICATION_TOKEN</code>, se o
                app recebe eventos de mensagem e, em espaços, se você{" "}
                <strong>menciona o bot</strong> (@…). Testar o endpoint no navegador só mostra que o
                servidor está no ar; quem envia mensagens ao grupo é o Google após você falar com o
                bot.
              </li>
              <li>
                <strong>B — Só faltam avisos automáticos</strong> (pipeline, lembretes): preencha o
                campo <strong>Webhook do espaço</strong> abaixo com a URL do espaço no Google Chat e
                garanta que existam tarefas/triggers que disparem esses envios.
              </li>
              <li>
                <strong>C — O bot responde, mas parece genérico</strong>: isso costuma ser falta de
                dados operacionais (tarefas, calendário, aprovações) ou expectativa de usar o
                playbook no chat — o playbook entra nas respostas do agente quando há integração
                OpenAI e dados carregados no workspace.
              </li>
            </ul>
          </details>
          <Label htmlFor="gc-auth-mode">Modo de autenticação</Label>
          <Input id="gc-auth-mode" value="Token de verificação" readOnly disabled />
          <Label htmlFor="gc-token-status">Status do token</Label>
          <Input
            id="gc-token-status"
            value={googleChatLegacyTokenConfigured ? "Configurado no runtime" : "Ausente no runtime"}
            readOnly
            disabled
          />
          <Label htmlFor="gc-endpoint">Endpoint do app</Label>
          <Input
            id="gc-endpoint"
            value={chatBotEndpoint}
            onChange={(e) => setChatBotEndpoint(e.target.value)}
            placeholder={effectiveGoogleChatLegacyEndpoint}
            disabled={localMode}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Cole aqui exatamente o endpoint configurado no Google Chat, por exemplo{" "}
            {effectiveGoogleChatLegacyEndpoint}. O parâmetro{" "}
            <code className="rounded bg-muted px-1">?token=...</code> deve ser o valor{" "}
            <strong>inteiro</strong> de <code className="rounded bg-muted px-1">GOOGLE_CHAT_VERIFICATION_TOKEN</code>{" "}
            no Firebase (mesmo valor do Google Cloud → Chat API → verificação). Se o token estiver
            truncado ou diferente, o bot não responde no chat. Endpoint base detectado hoje:{" "}
            {effectiveGoogleChatEndpointBase}.
          </p>
          <Label htmlFor="gc">Webhook do espaço (opcional)</Label>
          <Input
            id="gc"
            value={chatUrl}
            onChange={(e) => setChatUrl(e.target.value)}
            placeholder="https://chat.googleapis.com/v1/spaces/..."
            disabled={localMode}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Esse webhook é separado do endpoint do bot. Ele só é usado quando o AgentBee envia
            avisos para um espaço do Google Chat.
          </p>
          <Button type="button" onClick={saveChat} disabled={localMode || saving}>
            Salvar Google Chat
          </Button>
        </div>
      </div>

      <div className="space-y-4 rounded border border-gray-200 p-4 dark:border-gray-700">
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-900 dark:text-white">Instagram</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            <a href="/api/oauth/instagram" className="text-[#3c8dbc] underline">
              Conectar via Meta (OAuth)
            </a>{" "}
            — obtém token e tenta localizar o Instagram Business Account vinculado à página.
          </p>
          <Label htmlFor="ig-user">IG User ID</Label>
          <Input
            id="ig-user"
            value={instagramUserId}
            onChange={(e) => setInstagramUserId(e.target.value)}
            placeholder="1784..."
            disabled={localMode}
          />
          <Label htmlFor="ig-token">Access Token</Label>
          <Input
            id="ig-token"
            type="password"
            value={instagramAccessToken}
            onChange={(e) => setInstagramAccessToken(e.target.value)}
            placeholder="Token Instagram Graph API"
            disabled={localMode}
          />
          <Button type="button" onClick={saveInstagram} disabled={localMode || saving}>
            Salvar Instagram
          </Button>
        </div>
      </div>

      <div className="space-y-4 rounded border border-gray-200 p-4 dark:border-gray-700">
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-900 dark:text-white">LinkedIn</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            <a href="/api/oauth/linkedin" className="text-[#3c8dbc] underline">
              Conectar via LinkedIn (OAuth)
            </a>{" "}
            — salva o access token; informe abaixo o Organization ID (URN) para publicar.
          </p>
          <Label htmlFor="li-org">Organization ID</Label>
          <Input
            id="li-org"
            value={linkedinOrgId}
            onChange={(e) => setLinkedinOrgId(e.target.value)}
            placeholder="urn:li:organization:123456"
            disabled={localMode}
          />
          <Label htmlFor="li-token">Access Token</Label>
          <Input
            id="li-token"
            type="password"
            value={linkedinAccessToken}
            onChange={(e) => setLinkedinAccessToken(e.target.value)}
            placeholder="Token OAuth do LinkedIn"
            disabled={localMode}
          />
          <Button type="button" onClick={saveLinkedIn} disabled={localMode || saving}>
            Salvar LinkedIn
          </Button>
        </div>
      </div>

      <div className="space-y-4 rounded border border-gray-200 p-4 dark:border-gray-700">
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-900 dark:text-white">Google Workspace</p>
          <div className="space-y-2">
            <Label htmlFor="gw-service-email">Service account e-mail</Label>
            <Input
              id="gw-service-email"
              value={workspaceServiceEmail}
              onChange={(e) => setWorkspaceServiceEmail(e.target.value)}
              placeholder="agentbee-service@project.iam.gserviceaccount.com"
              disabled={localMode}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gw-admin-email">Usuário delegado (admin)</Label>
            <Input
              id="gw-admin-email"
              value={workspaceDelegatedUser}
              onChange={(e) => setWorkspaceDelegatedUser(e.target.value)}
              placeholder="admin@empresa.com"
              disabled={localMode}
            />
          </div>
          <Button
            type="button"
            onClick={saveGoogleWorkspace}
            disabled={localMode || saving}
            variant="outline"
          >
            Salvar Google Workspace
          </Button>
        </div>
      </div>

      {msg ? (
        <p className="lg:col-span-2 text-sm text-muted-foreground">{msg}</p>
      ) : null}
    </div>
  );
}
