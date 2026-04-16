import { requireWorkspaceMember } from "@/lib/auth/session";
import { upsertPlaybookDocument } from "@/actions/playbook";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { isLocalMode } from "@/lib/env";
import { localPlaybookDocuments } from "@/lib/local-mode";

export default async function PlaybookPage() {
  const localMode = isLocalMode();
  if (localMode) {
    return <PlaybookPageView docs={localPlaybookDocuments} localMode />;
  }

  const { supabase, workspaceId } = await requireWorkspaceMember();

  const { data: docs } = await supabase
    .from("playbook_documents")
    .select("id, title, updated_at, content_markdown")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });

  return <PlaybookPageView docs={docs ?? []} />;
}

function PlaybookPageView({
  docs,
  localMode = false,
}: {
  docs: {
    id: string;
    title: string;
    updated_at: string;
    content_markdown: string;
  }[];
  localMode?: boolean;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white">
          Playbook / Brand Brain
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Memória institucional e diretrizes que alimentam o pipeline.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="rounded bg-white shadow dark:bg-card">
          <CardHeader className="border-b border-gray-200 dark:border-gray-700">
            <CardTitle>Novo documento</CardTitle>
            <CardDescription>
              {localMode
                ? "Modo local ativo. O formulário fica disponível para validar estrutura."
                : "Versões e histórico podem ser expandidos na próxima fase."}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <form action={localMode ? undefined : upsertPlaybookDocument} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Título</Label>
                <Input
                  id="title"
                  name="title"
                  placeholder="Tom de voz"
                  required={!localMode}
                  disabled={localMode}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="content">Conteúdo (Markdown)</Label>
                <Textarea
                  id="content"
                  name="content"
                  rows={12}
                  placeholder="Posicionamento, promessas, palavras evitadas..."
                  disabled={localMode}
                />
              </div>
              <Button type={localMode ? "button" : "submit"} disabled={localMode}>
                Salvar
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="rounded bg-white shadow dark:bg-card">
          <CardHeader className="border-b border-gray-200 dark:border-gray-700">
            <CardTitle>Documentos</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <ScrollArea className="h-[480px] pr-4">
              <div className="space-y-4">
                {docs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum documento ainda.
                  </p>
                ) : (
                  docs.map((doc) => (
                    <div key={doc.id} className="rounded border border-gray-200 p-3 dark:border-gray-700">
                      <p className="font-medium text-gray-900 dark:text-white">
                        {doc.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(doc.updated_at).toLocaleString("pt-BR")}
                      </p>
                      <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
                        {doc.content_markdown}
                      </pre>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
