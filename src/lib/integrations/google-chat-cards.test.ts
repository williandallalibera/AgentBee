import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApprovalCard } from "./google-chat-cards";

describe("buildApprovalCard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("inclui cardsV2 com botões e taskId nos parâmetros", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    const card = buildApprovalCard({
      taskId: "550e8400-e29b-41d4-a716-446655440000",
      stage: "final",
      title: "Campanha Q2",
      caption: "Texto do post",
      imageUrl: "https://example.com/a.png",
      webUrl: "https://app.example/approvals/550e8400-e29b-41d4-a716-446655440000/final",
    });
    expect(card).toMatchSnapshot();
    expect(card.cardsV2).toHaveLength(1);
    const section = card.cardsV2[0].card.sections?.[0];
    const widgets = section?.widgets ?? [];
    const buttons = widgets.flatMap((w: { buttonList?: { buttons?: unknown[] } }) =>
      w.buttonList?.buttons ? w.buttonList.buttons : [],
    );
    const texts = buttons.map((b: { text?: string }) => b.text);
    expect(texts).toContain("Aprovar");
    expect(texts).toContain("Pedir ajuste");
    expect(JSON.stringify(card)).toContain("550e8400-e29b-41d4-a716-446655440000");
  });
});
