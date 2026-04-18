/**
 * Google Chat Cards v2 — builders para mensagens interativas (incoming webhook).
 * @see https://developers.google.com/chat/how-tos/cards-on-messages
 */

export type ApprovalCardStage = "initial" | "final";

function cardAction(
  actionMethodName: string,
  parameters: Array<{ key: string; value: string }>,
) {
  return {
    action: {
      actionMethodName,
      function: actionMethodName,
      parameters,
    },
  };
}

function truncate(text: string, max: number) {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Um botão de card (Chat aceita actionMethodName e/ou function no payload). */
function cardButton(text: string, actionMethodName: string, params: Record<string, string>) {
  const parameters = Object.entries(params).map(([key, value]) => ({ key, value }));
  return {
    text,
    onClick: cardAction(actionMethodName, parameters),
  };
}

export function buildApprovalCard(input: {
  taskId: string;
  stage: ApprovalCardStage;
  title: string;
  caption: string;
  imageUrl?: string | null;
  webUrl: string;
}) {
  const stageLabel = input.stage === "initial" ? "Aprovação inicial" : "Aprovação final";
  const bodyText = truncate(input.caption, 1800);

  const widgets: Array<Record<string, unknown>> = [];

  if (input.imageUrl?.trim()) {
    widgets.push({
      image: {
        imageUrl: input.imageUrl.trim(),
        altText: input.title,
      },
    });
  }

  widgets.push({
    decoratedText: {
      topLabel: stageLabel,
      text: bodyText || "_Sem texto_",
      wrapText: true,
    },
  });

  widgets.push({
    buttonList: {
      buttons: [
        cardButton("Aprovar", "chief_approve", { taskId: input.taskId }),
        cardButton("Pedir ajuste", "chief_request_revision", { taskId: input.taskId }),
        cardButton("Nova direção", "chief_new_direction", { taskId: input.taskId }),
        cardButton("Cancelar fluxo", "chief_cancel", { taskId: input.taskId }),
      ],
    },
  });

  widgets.push({
    buttonList: {
      buttons: [
        {
          text: "Abrir no AgentBee",
          onClick: { openLink: { url: input.webUrl } },
        },
      ],
    },
  });

  return {
    cardsV2: [
      {
        cardId: `approval-${input.taskId}-${input.stage}-${Date.now()}`,
        card: {
          header: {
            title: truncate(input.title, 256),
            subtitle: stageLabel,
          },
          sections: [{ widgets }],
        },
      },
    ],
  };
}

export function buildCalendarItemCard(input: {
  itemId: string;
  date: string;
  title: string;
  taskId?: string | null;
  approvalWebUrl?: string;
}) {
  const widgets: Array<Record<string, unknown>> = [
    {
      decoratedText: {
        topLabel: `Data: ${input.date}`,
        text: truncate(input.title, 1500),
        wrapText: true,
      },
    },
    {
      buttonList: {
        buttons: [
          cardButton("Começar agora", "start_calendar_item", { itemId: input.itemId }),
          cardButton("Reagendar +1 dia", "reschedule_calendar_item", {
            itemId: input.itemId,
            offsetDays: "1",
          }),
          ...(input.taskId
            ? [
                cardButton("Aprovar task", "chief_approve", { taskId: input.taskId }),
              ]
            : []),
        ],
      },
    },
  ];

  if (input.approvalWebUrl) {
    widgets.push({
      buttonList: {
        buttons: [
          {
            text: "Abrir aprovação",
            onClick: {
              openLink: { url: input.approvalWebUrl },
            },
          },
        ],
      },
    });
  }

  return {
    cardsV2: [
      {
        cardId: `cal-${input.itemId}-${Date.now()}`,
        card: {
          header: {
            title: "Calendário — ação necessária",
            subtitle: input.date,
          },
          sections: [{ widgets }],
        },
      },
    ],
  };
}

export function buildPublicationResultCard(input: {
  publicationId: string;
  taskTitle: string;
  channel: string;
  status: "published" | "failed";
  postUrl?: string | null;
  errorMessage?: string | null;
}) {
  const isFail = input.status === "failed";
  const widgets: Array<Record<string, unknown>> = [
    {
      decoratedText: {
        topLabel: `Canal: ${input.channel}`,
        text: isFail
          ? truncate(input.errorMessage ?? "Falha desconhecida", 1500)
          : `Publicado com sucesso.${input.postUrl ? ` Link: ${input.postUrl}` : ""}`,
        wrapText: true,
      },
    },
  ];

  const buttons: Array<Record<string, unknown>> = [];
  if (!isFail && input.postUrl) {
    buttons.push({
      text: "Ver post",
      onClick: { openLink: { url: input.postUrl } },
    });
  }
  if (isFail) {
    buttons.push(cardButton("Tentar de novo", "retry_publication", { publicationId: input.publicationId }));
 }

  if (buttons.length) {
    widgets.push({ buttonList: { buttons } });
  }

  return {
    cardsV2: [
      {
        cardId: `pub-${input.publicationId}-${Date.now()}`,
        card: {
          header: {
            title: isFail ? "Falha ao publicar" : "Publicado nas redes",
            subtitle: truncate(input.taskTitle, 200),
          },
          sections: [{ widgets }],
        },
      },
    ],
  };
}

export type DigestLine = { kind: "approval" | "publish" | "failure"; text: string };

export function buildDigestCard(lines: DigestLine[], webUrl: string) {
  const text = lines.length
    ? lines.map((l) => `• ${l.text}`).join("\n")
    : "Nada pendente no resumo de hoje.";

  return {
    cardsV2: [
      {
        cardId: `digest-${Date.now()}`,
        card: {
          header: {
            title: "AgentBee — resumo matinal",
            subtitle: new Date().toISOString().slice(0, 10),
          },
          sections: [
            {
              widgets: [
                {
                  decoratedText: {
                    text: truncate(text, 3500),
                    wrapText: true,
                  },
                },
                {
                  buttonList: {
                    buttons: [
                      {
                        text: "Abrir painel",
                        onClick: { openLink: { url: webUrl } },
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      },
    ],
  };
}
