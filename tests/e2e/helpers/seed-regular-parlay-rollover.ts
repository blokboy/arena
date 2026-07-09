import type { APIRequestContext } from "@playwright/test";

export async function seedDecisiveRegularParlayRollover(request: APIRequestContext) {
  const response = await request.post("/api/test/regular-parlay-rollover-seed");

  if (!response.ok()) {
    throw new Error(`E2E seed failed with status ${response.status()}`);
  }

  const body = (await response.json()) as {
    data: {
      parlayId: string;
      alice: { username: string; password: string };
      currentQuestion: string;
      nextQuestion: string;
    };
  };

  return body.data;
}
