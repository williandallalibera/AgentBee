import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function AiSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Config IA</h1>
        <p className="text-muted-foreground text-sm">
          Modelos por agente e limites de custo — use variáveis de ambiente e
          integração OpenAI no painel de Integrações (metadata).
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Variáveis recomendadas</CardTitle>
          <CardDescription>Servidor / Vercel / Trigger.dev</CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-2 text-sm">
          <p>
            <code>OPENAI_API_KEY</code> — obrigatório para geração com IA.
          </p>
          <p>
            <code>OPENAI_MODEL</code> — opcional (padrão gpt-4o-mini).
          </p>
          <p>
            <code>TRIGGER_SECRET_KEY</code> — orquestração e waitpoints.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
