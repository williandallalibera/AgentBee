import { requireWorkspaceMember } from "@/lib/auth/session";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IntegrationForms } from "@/components/integrations/integration-forms";
import { isLocalMode } from "@/lib/env";
import { localIntegrations } from "@/lib/local-mode";

function providerLabel(provider: string) {
  switch (provider) {
    case "google_chat":
      return "Google Chat";
    case "google_workspace":
      return "Google Workspace";
    case "openai":
      return "OpenAI";
    case "instagram":
      return "Instagram";
    case "linkedin":
      return "LinkedIn";
    default:
      return provider;
  }
}

const EXPECTED_PROVIDERS = [
  "openai",
  "google_chat",
  "google_workspace",
  "instagram",
  "linkedin",
] as const;

export default async function IntegrationsPage() {
  if (isLocalMode()) {
    return <IntegrationsPageView integrations={localIntegrations} localMode />;
  }

  const { supabase, workspaceId } = await requireWorkspaceMember();

  const { data: integrations } = await supabase
    .from("integrations")
    .select("id, provider, status, last_tested_at, config_metadata_json")
    .eq("workspace_id", workspaceId)
    .order("provider");

  return <IntegrationsPageView integrations={integrations ?? []} />;
}

function IntegrationsPageView({
  integrations,
  localMode = false,
}: {
  integrations: {
    id: string;
    provider: string;
    status: string;
    last_tested_at: string | null;
    config_metadata_json?: Record<string, unknown> | null;
  }[];
  localMode?: boolean;
}) {
  const mergedIntegrations = EXPECTED_PROVIDERS.map((provider) => {
    const existing = integrations.find((item) => item.provider === provider);
    if (existing) return existing;
    return {
      id: `missing-${provider}`,
      provider,
      status: "disconnected",
      last_tested_at: null,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white">
          Integrações
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Credenciais, conectividade e testes operacionais do workspace.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {mergedIntegrations.map((integration) => (
          <Card key={integration.id} className="rounded bg-white shadow dark:bg-card">
            <CardHeader className="border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-lg capitalize">
                  {providerLabel(integration.provider)}
                </CardTitle>
                <Badge variant="outline">{integration.status}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 pt-4 text-xs text-muted-foreground">
              <p>
                Último teste:{" "}
                {integration.last_tested_at
                  ? new Date(integration.last_tested_at).toLocaleString("pt-BR")
                  : "—"}
              </p>
              <p>
                {localMode
                  ? "Integração em modo de preview."
                  : "Integração configurável por workspace."}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="rounded bg-white shadow dark:bg-card">
        <CardHeader className="border-b border-gray-200 dark:border-gray-700">
          <CardTitle>Configurar</CardTitle>
          <CardDescription>
            {localMode
              ? "Formulário visível para teste visual, com submissão desabilitada."
              : "OpenAI, Google Chat, Instagram e LinkedIn podem ser preparados por workspace."}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <IntegrationForms
            localMode={localMode}
            initialConfigs={Object.fromEntries(
              integrations.map((integration) => [
                integration.provider,
                integration.config_metadata_json ?? {},
              ]),
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
}
