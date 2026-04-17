import { describe, expect, it } from "vitest";
import {
  normalizeChiefAgentPlan,
  type ChiefAgentPlan,
  type ChiefAgentSnapshot,
} from "@/lib/chief-agent/agent";

const emptyFallback: ChiefAgentPlan = {
  intent: "chat",
  reply: "fallback",
  taskId: null,
  itemId: null,
  date: null,
  comments: null,
  confidence: "low",
  campaignDraft: null,
};

const minimalSnapshot: ChiefAgentSnapshot = {
  recentTasks: [],
  pendingApprovals: [
    {
      id: "11111111-1111-1111-1111-111111111111",
      taskId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      title: "Post teste",
      approvalType: "initial_summary",
      taskStatus: "awaiting_initial_approval",
      createdAt: new Date().toISOString(),
    },
  ],
  upcomingPosts: [],
  blockedItems: [],
  playbookExcerpt: "",
  recentCampaigns: [
    { id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", name: "Campanha Soja", status: "active", objective: "x" },
  ],
};

describe("normalizeChiefAgentPlan", () => {
  it("aceita generate_calendar com parâmetros padrão", () => {
    const out = normalizeChiefAgentPlan(
      {
        intent: "generate_calendar",
        reply: "ok",
        confidence: "high",
      },
      minimalSnapshot,
      emptyFallback,
    );
    expect(out.intent).toBe("generate_calendar");
    expect(out.generateCalendarParams?.weeksAhead).toBe(4);
    expect(out.generateCalendarParams?.postsPerWeek).toBe(2);
  });

  it("resolve pause_campaign por nome parcial da campanha", () => {
    const out = normalizeChiefAgentPlan(
      {
        intent: "pause_campaign",
        reply: "pausando",
        targetCampaignId: "Soja",
        confidence: "high",
      },
      minimalSnapshot,
      emptyFallback,
    );
    expect(out.intent).toBe("pause_campaign");
    expect(out.targetCampaignId).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  });

  it("rejeita task_detail sem UUID válido", () => {
    const out = normalizeChiefAgentPlan(
      {
        intent: "task_detail",
        taskId: "nope",
        reply: "x",
        confidence: "high",
      },
      minimalSnapshot,
      emptyFallback,
    );
    expect(out.intent).toBe("chat");
  });

  it("aceita cancel_task com task em aprovação pendente", () => {
    const out = normalizeChiefAgentPlan(
      {
        intent: "cancel_task",
        taskId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        reply: "cancelando",
        confidence: "high",
      },
      minimalSnapshot,
      emptyFallback,
    );
    expect(out.intent).toBe("cancel_task");
    expect(out.taskId).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  });
});
