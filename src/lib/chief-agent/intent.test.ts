import { describe, expect, it } from "vitest";
import { classifyChiefIntent } from "@/lib/chief-agent/intent";

describe("classifyChiefIntent", () => {
  it("não confunde calendário de sugestão com listagem de agendadas", () => {
    const msg =
      "@Abelhudo planege uma campanha de crescimento e me apresente o calendario de sugestão de postagens quero a sugestão das postagens";
    expect(classifyChiefIntent(msg).kind).toBe("unknown");
  });

  it("lista próximas postagens quando for pedido de agenda existente", () => {
    expect(classifyChiefIntent("quais as próximas postagens?").kind).toBe("upcoming_posts");
  });

  it("planeje com grafia correta também prioriza planejamento sobre listagem", () => {
    expect(
      classifyChiefIntent("planeje uma campanha de soja e sugira datas no calendário").kind,
    ).toBe("unknown");
  });
});
