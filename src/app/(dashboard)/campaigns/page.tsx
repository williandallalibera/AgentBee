import { requireWorkspaceMember } from "@/lib/auth/session";
import { createCampaignFromForm } from "@/actions/campaign";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { isLocalMode } from "@/lib/env";
import { localCampaigns } from "@/lib/local-mode";

export default async function CampaignsPage() {
  const localMode = isLocalMode();
  if (localMode) {
    return <CampaignsPageView campaigns={localCampaigns} localMode />;
  }

  const { supabase, workspaceId } = await requireWorkspaceMember();

  const { data: brands } = await supabase
    .from("brands")
    .select("id")
    .eq("workspace_id", workspaceId)
    .limit(1);

  const brandId = brands?.[0]?.id;

  const { data: campaigns } = brandId
    ? await supabase
        .from("campaigns")
        .select("*")
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false })
    : { data: [] };

  return <CampaignsPageView campaigns={campaigns ?? []} disabled={!brandId} />;
}

function CampaignsPageView({
  campaigns,
  disabled = false,
  localMode = false,
}: {
  campaigns: {
    id: string;
    name: string;
    status: string;
    objective: string | null;
  }[];
  disabled?: boolean;
  localMode?: boolean;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white">
          Campanhas
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Objetivos, contexto e direcionamento para o planejamento editorial.
        </p>
      </div>

      <Card className="rounded bg-white shadow dark:bg-card">
        <CardHeader className="border-b border-gray-200 dark:border-gray-700">
          <CardTitle>Nova campanha</CardTitle>
          <CardDescription>
            {localMode
              ? "Preview local ativo. Estrutura do formulário mantida sem persistência."
              : "Associa à primeira marca disponível no workspace."}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <form
            action={localMode ? undefined : createCampaignFromForm}
            className="grid max-w-2xl gap-4"
          >
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" name="name" required={!localMode} disabled={localMode} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="objective">Objetivo</Label>
              <Textarea
                id="objective"
                name="objective"
                rows={4}
                disabled={localMode}
              />
            </div>
            <div>
              <Button type={localMode ? "button" : "submit"} disabled={localMode || disabled}>
                Criar campanha
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {campaigns.map((campaign) => (
          <Card key={campaign.id} className="rounded bg-white shadow dark:bg-card">
            <CardHeader className="border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-lg">{campaign.name}</CardTitle>
                <Badge variant="outline">{campaign.status}</Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">
                {campaign.objective ?? "Sem objetivo definido."}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
