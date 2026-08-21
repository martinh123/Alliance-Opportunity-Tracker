import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";

/**
 * These tests lock in the cost-saving caching contract for company research:
 *
 *  - GET /opportunities/:id/company-research must read from the DB and NEVER
 *    invoke the AI client (no re-billing on page load).
 *  - POST /opportunities/:id/company-research/refresh is the ONLY path that
 *    calls the AI client, and it must upsert exactly one row per opportunity
 *    with a fresh generatedAt.
 */

// ---------------------------------------------------------------------------
// In-memory fakes (hoisted so the vi.mock factories below can reference them).
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => {
  const researchStore = new Map<number, any>();
  const opportunityStore = new Map<number, any>();

  const fakeDb = {
    select(_cols?: any) {
      return {
        from(table: any) {
          return {
            where(cond: any) {
              if (table.__table === "opportunities") {
                const row = opportunityStore.get(cond.val);
                return Promise.resolve(row ? [row] : []);
              }
              const row = researchStore.get(cond.val);
              return Promise.resolve(row ? [row] : []);
            },
          };
        },
      };
    },
    insert(_table: any) {
      return {
        values(vals: any) {
          return {
            onConflictDoUpdate(_cfg: any) {
              return {
                returning() {
                  const existing = researchStore.get(vals.opportunityId);
                  const saved = existing ? { ...existing, ...vals } : { ...vals };
                  researchStore.set(vals.opportunityId, saved);
                  return Promise.resolve([saved]);
                },
              };
            },
          };
        },
      };
    },
  };

  // Spy for the underlying Gemini client; used to prove the route never reaches
  // the AI provider directly on a GET.
  const generateContent = vi.fn();

  return { researchStore, opportunityStore, fakeDb, generateContent };
});

vi.mock("@workspace/db", () => ({
  db: h.fakeDb,
  opportunitiesTable: {
    __table: "opportunities",
    id: "id",
    endCustomer: "endCustomer",
    endCustomerDomain: "endCustomerDomain",
  },
  companyResearchTable: {
    __table: "company_research",
    opportunityId: "opportunityId",
  },
}));

// Make eq() return a plain { col, val } so the fake db can filter on it.
vi.mock("drizzle-orm", () => ({
  eq: (col: string, val: unknown) => ({ col, val }),
}));

// Always authenticated for these tests.
vi.mock("../lib/requireAuth", () => ({
  requireAuth: () => 1,
}));

// The AI boundary. generateCompanyResearch is what calls Gemini; asserting its
// call count is the primary signal that the GET path is not re-billing.
vi.mock("../lib/companyIntel", () => ({
  resolveCompanies: vi.fn(),
  generateCompanyResearch: vi.fn(),
}));

// Extra guard: if anyone wires the Gemini client directly into a route, this
// spy would fire. It must stay at zero for the GET path.
vi.mock("@workspace/integrations-gemini-ai", () => ({
  ai: { models: { generateContent: h.generateContent } },
}));

import companyRouter from "./company";
import { generateCompanyResearch } from "../lib/companyIntel";

const genMock = vi.mocked(generateCompanyResearch);

function makeApp() {
  const app = express();
  app.use(express.json());
  // The auth cookie value is irrelevant because requireAuth is mocked.
  app.use(companyRouter);
  return app;
}

beforeEach(() => {
  h.researchStore.clear();
  h.opportunityStore.clear();
  h.generateContent.mockReset();
  genMock.mockReset();
  vi.useRealTimers();
});

describe("GET /opportunities/:id/company-research (load path)", () => {
  it("returns 404 when no research exists and never calls the AI client", async () => {
    const app = makeApp();

    const res = await request(app).get("/opportunities/42/company-research");

    expect(res.status).toBe(404);
    expect(genMock).not.toHaveBeenCalled();
    expect(h.generateContent).not.toHaveBeenCalled();
  });

  it("returns the stored row from the DB without calling the AI client", async () => {
    h.researchStore.set(7, {
      opportunityId: 7,
      companyName: "Acme Corp",
      companyDomain: "acme.com",
      industry: null,
      location: null,
      overview: "An overview.",
      sections: [
        {
          element: "metrics",
          summary: "Some metrics context.",
          sources: [{ title: "Acme IR", url: "https://acme.com/ir" }],
        },
      ],
      status: "ready",
      error: null,
      generatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const app = makeApp();
    const res = await request(app).get("/opportunities/7/company-research");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      opportunityId: 7,
      companyName: "Acme Corp",
      status: "ready",
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(res.body.sections).toHaveLength(1);

    // Reading must NOT trigger any AI work.
    expect(genMock).not.toHaveBeenCalled();
    expect(h.generateContent).not.toHaveBeenCalled();
  });
});

describe("POST /opportunities/:id/company-research/refresh (generate path)", () => {
  it("is the only path that calls the AI client and upserts a single fresh row", async () => {
    h.opportunityStore.set(7, {
      id: 7,
      endCustomer: "Acme Corp",
      endCustomerDomain: "acme.com",
    });

    genMock.mockResolvedValue({
      overview: "Generated overview.",
      sections: [
        {
          element: "metrics",
          summary: "Generated metrics context.",
          sources: [{ title: "Acme IR", url: "https://acme.com/ir" }],
        },
      ],
    });

    const app = makeApp();

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-26T10:00:00.000Z"));

    const first = await request(app).post(
      "/opportunities/7/company-research/refresh",
    );

    expect(first.status).toBe(200);
    expect(genMock).toHaveBeenCalledTimes(1);
    expect(genMock).toHaveBeenCalledWith({
      name: "Acme Corp",
      domain: "acme.com",
    });
    expect(first.body.generatedAt).toBe("2026-06-26T10:00:00.000Z");
    expect(h.researchStore.size).toBe(1);

    // A second refresh must REPLACE the row (single row per opportunity) and
    // produce a newer generatedAt — never create a duplicate.
    vi.setSystemTime(new Date("2026-06-26T11:30:00.000Z"));

    const second = await request(app).post(
      "/opportunities/7/company-research/refresh",
    );

    expect(second.status).toBe(200);
    expect(genMock).toHaveBeenCalledTimes(2);
    expect(h.researchStore.size).toBe(1);
    expect(second.body.generatedAt).toBe("2026-06-26T11:30:00.000Z");
    expect(
      new Date(second.body.generatedAt).getTime(),
    ).toBeGreaterThan(new Date(first.body.generatedAt).getTime());

    vi.useRealTimers();
  });

  it("returns 404 and does not call the AI client when the opportunity is missing", async () => {
    const app = makeApp();

    const res = await request(app).post(
      "/opportunities/999/company-research/refresh",
    );

    expect(res.status).toBe(404);
    expect(genMock).not.toHaveBeenCalled();
    expect(h.researchStore.size).toBe(0);
  });

  it("returns 400 and does not call the AI client when no end customer is set", async () => {
    h.opportunityStore.set(8, {
      id: 8,
      endCustomer: "",
      endCustomerDomain: null,
    });

    const app = makeApp();
    const res = await request(app).post(
      "/opportunities/8/company-research/refresh",
    );

    expect(res.status).toBe(400);
    expect(genMock).not.toHaveBeenCalled();
    expect(h.researchStore.size).toBe(0);
  });
});
