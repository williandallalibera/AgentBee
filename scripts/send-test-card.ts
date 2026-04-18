/**
 * Smoke: envia um card de aprovação de teste ao webhook do Google Chat.
 *
 * Uso: GOOGLE_CHAT_WEBHOOK_URL=https://chat.googleapis.com/... npx tsx scripts/send-test-card.ts
 */
import { buildApprovalCard } from "../src/lib/integrations/google-chat-cards";
import { sendGoogleChatCard } from "../src/lib/integrations/google-chat";

async function main() {
  const url = process.env.GOOGLE_CHAT_WEBHOOK_URL?.trim();
  if (!url) {
    console.error("Defina GOOGLE_CHAT_WEBHOOK_URL no ambiente.");
    process.exit(1);
  }

  const taskId = "550e8400-e29b-41d4-a716-446655440000";
  const card = buildApprovalCard({
    taskId,
    stage: "initial",
    title: "Smoke AgentBee — card de teste",
    caption: "Este é um post fictício só para validar botões e layout no espaço.",
    imageUrl: "https://www.gstatic.com/chat/images/logo_chat_480.png",
    webUrl: `https://example.com/approvals/${taskId}/initial`,
  });

  const result = await sendGoogleChatCard(url, card, {
    title: "AgentBee (fallback)",
    lines: [
      "Não foi possível enviar o card; confira CHIEF_CARDS_ENABLED e o webhook.",
      `Task de exemplo: ${taskId}`,
    ],
  });

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

void main();
