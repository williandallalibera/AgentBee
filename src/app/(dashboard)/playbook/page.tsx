import { requireWorkspaceMember } from "@/lib/auth/session";
import { upsertPlaybookDocument } from "@/actions/playbook";
import {
  deletePlaybookVisualReference,
  uploadPlaybookVisualReference,
} from "@/actions/playbook-visual-refs";
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
  visualRefs = [],
  localMode = false,
}: {
  docs: {
    id: string;
    title: string;
    updated_at: string;
    content_markdown: string;
  }[];
  visualRefs?: {
    id: string;
    title: string;
    notes: string | null;
    storage_path: string;
    created_at: string;
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
          Memória institucional e diretrizes da marca. O pipeline também usa{" "}
          <strong>pesquisa web</strong> (configure <code className="text-xs">SERPER_API_KEY</code> no
          deploy) para enriquecer propostas — o playbook continua sendo a base de voz e posicionamento.
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

      <Card className="rounded bg-white shadow dark:bg-card">
        <CardHeader className="border-b border-gray-200 dark:border-gray-700">
          <CardTitle>Artes modelo (referência visual)</CardTitle>
          <CardDescription>
            Envie imagens de referência para o agente de arte analisar o estilo (cores, layout, mood) e
            orientar a geração da peça. Até 3 referências mais recentes são usadas por tarefa.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-4">
          {localMode ? (
            <p className="text-sm text-muted-foreground">
              Modo local — upload desativado.
            </p>
          ) : (
            <form action={uploadPlaybookVisualReference} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="ref-file">Imagem (PNG, JPG, WebP — máx. 5 MB)</Label>
                <Input id="ref-file" name="file" type="file" accept="image/png,image/jpeg,image/webp" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ref-title">Título</Label>
                <Input id="ref-title" name="title" placeholder="Ex.: Post LinkedIn institucional Q1" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ref-notes">Notas (opcional)</Label>
                <Input id="ref-notes" name="notes" placeholder="Ex.: usar esse grid e tipografia" />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit">Enviar referência</Button>
              </div>
            </form>
          )}

          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-900 dark:text-white">Referências salvas</p>
            {visualRefs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma ainda.</p>
            ) : (
              <ul className="space-y-3">
                {visualRefs.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-start justify-between gap-2 rounded border border-gray-200 p-3 dark:border-gray-700"
                  >
                    <div>
                      <p className="font-medium">{r.title}</p>
                      {r.notes ? (
                        <p className="text-muted-foreground text-xs">{r.notes}</p>
                      ) : null}
                      <p className="text-muted-foreground text-xs">
                        {new Date(r.created_at).toLocaleString("pt-BR")}
                      </p>
                    </div>
                    {!localMode ? (
                      <form action={deletePlaybookVisualReference}>
                        <input type="hidden" name="id" value={r.id} />
                        <Button type="submit" variant="outline" size="sm">
                          Remover
                        </Button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
