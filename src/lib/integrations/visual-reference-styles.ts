/**
 * Resume estilos visuais de referências (imagens no storage) via visão, para enriquecer prompt do DALL·E.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_REFS = 3;

async function describeImageUrl(imageUrl: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return "";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL ?? "gpt-4o-mini",
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Você é diretor de arte. Em 3–4 frases em português do Brasil, descreva o *estilo visual* desta imagem de referência: paleta, contraste, tipografia (se houver), composição, espaço negativo, mood (corporativo, jovem, premium etc.). " +
                "Foco em aspectos que outro designer possa replicar em um post quadrado para Instagram/LinkedIn. Sem inventar texto ilegível na arte final.",
            },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) return "";
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

/**
 * Carrega até MAX_REFS imagens de referência do workspace e devolve notas concatenadas para o prompt de geração.
 */
export async function buildVisualStyleNotesFromReferences(input: {
  supabase: SupabaseClient;
  workspaceId: string;
}): Promise<string> {
  const { data: rows, error } = await input.supabase
    .from("playbook_visual_references")
    .select("id, title, notes, storage_path")
    .eq("workspace_id", input.workspaceId)
    .order("created_at", { ascending: false })
    .limit(MAX_REFS);

  if (error || !rows?.length) {
    return "";
  }

  const parts: string[] = [];
  for (const row of rows) {
    const path = row.storage_path as string;
    const { data: signed, error: signErr } = await input.supabase.storage
      .from("playbook-assets")
      .createSignedUrl(path, 3600);
    if (signErr || !signed?.signedUrl) continue;

    const desc = await describeImageUrl(signed.signedUrl);
    if (!desc) continue;

    const title = (row.title as string)?.trim() || "Referência";
    const notes = (row.notes as string | null)?.trim();
    parts.push(
      `**${title}**${notes ? ` (${notes})` : ""}:\n${desc}`,
    );
  }

  if (parts.length === 0) return "";
  return (
    "\n\n*Diretrizes visuais a partir de artes modelo do cliente:*\n" + parts.join("\n\n")
  );
}
