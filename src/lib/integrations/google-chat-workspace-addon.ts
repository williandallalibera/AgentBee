import type { GoogleChatEventPayload } from "@/lib/chief-agent/agent";

/**
 * Apps publicados como Google Workspace Add-on (Chat) exigem resposta no formato
 * DataActions / createMessageAction — não o JSON simples { text } do guia HTTP do Chat API.
 * @see https://developers.google.com/workspace/add-ons/chat/send-messages
 */

/**
 * Por padrão usa formato **Workspace Add-on** (`hostAppDataAction`). O JSON `{ text }` na
 * raiz quebra o runtime de add-on ("Cannot find field: text in ... RenderActions").
 * App **somente** Chat API HTTP (sem add-on): `GOOGLE_CHAT_WORKSPACE_ADDON=false`.
 */
export function shouldUseWorkspaceAddonResponseFormat(): boolean {
  return process.env.GOOGLE_CHAT_WORKSPACE_ADDON?.trim() !== "false";
}

/** Corpo esperado pelo runtime de add-on para enviar uma mensagem de texto. */
export function workspaceAddonCreateTextMessage(text: string): Record<string, unknown> {
  return {
    hostAppDataAction: {
      chatDataAction: {
        createMessageAction: {
          message: { text },
        },
      },
    },
  };
}

/**
 * Converte POST do add-on (`body.chat.*`) para o formato Event do Chat API usado pelo agente.
 */
function withRootToken<T extends GoogleChatEventPayload>(
  base: T,
  raw: Record<string, unknown>,
): GoogleChatEventPayload {
  if (typeof raw.token === "string") {
    return { ...base, token: raw.token };
  }
  return base;
}

export function normalizeChatWebhookPayload(raw: unknown): GoogleChatEventPayload {
  if (!raw || typeof raw !== "object") return raw as GoogleChatEventPayload;
  const r = raw as Record<string, unknown>;
  const chat = r.chat;
  if (!chat || typeof chat !== "object") return raw as GoogleChatEventPayload;
  const c = chat as Record<string, unknown>;

  if (c.removedFromSpacePayload) {
    const rsp = c.removedFromSpacePayload as Record<string, unknown>;
    return withRootToken(
      {
        type: "REMOVED_FROM_SPACE",
        space: rsp.space as GoogleChatEventPayload["space"],
      } as GoogleChatEventPayload,
      r,
    );
  }

  if (c.addedToSpacePayload) {
    const asp = c.addedToSpacePayload as Record<string, unknown>;
    return withRootToken(
      {
        type: "ADDED_TO_SPACE",
        space: asp.space as GoogleChatEventPayload["space"],
        user: (c.user ?? asp.user) as GoogleChatEventPayload["user"],
      } as GoogleChatEventPayload,
      r,
    );
  }

  if (c.messagePayload && typeof c.messagePayload === "object") {
    const mp = c.messagePayload as Record<string, unknown>;
    const msg = mp.message;
    if (msg && typeof msg === "object") {
      const m = msg as Record<string, unknown>;
      const topSpace = (m.space ?? mp.space) as GoogleChatEventPayload["space"] | undefined;
      return withRootToken(
        {
          type: "MESSAGE",
          message: m as GoogleChatEventPayload["message"],
          space: topSpace,
          user: (c.user ?? m.sender ?? mp.user) as GoogleChatEventPayload["user"],
          thread: m.thread as GoogleChatEventPayload["thread"],
        } as GoogleChatEventPayload,
        r,
      );
    }
  }

  return raw as GoogleChatEventPayload;
}
