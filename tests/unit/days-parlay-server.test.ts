import { describe, expect, it } from "vitest";

import { filterEligibleEventsForUtcDay } from "@/server/days-parlay";

describe("filterEligibleEventsForUtcDay", () => {
  it("keeps only markets whose endDate falls inside the target UTC day", () => {
    const filtered = filterEligibleEventsForUtcDay(
      [
        {
          gammaId: "event-1",
          title: "Politics",
          category: "Politics",
          markets: [
            { gammaId: "market-before", endDate: "2026-01-14T23:59:59.999Z" },
            { gammaId: "market-inside", endDate: "2026-01-15T18:00:00.000Z" },
            { gammaId: "market-after", endDate: "2026-01-16T00:00:00.000Z" }
          ]
        },
        {
          gammaId: "event-2",
          title: "Sports",
          category: "Sports",
          markets: [{ gammaId: "sports-inside", endDate: "2026-01-15T03:00:00.000Z" }]
        }
      ],
      new Date("2026-01-15T12:00:00.000Z")
    );

    expect(filtered).toEqual([
      {
        gammaId: "event-1",
        title: "Politics",
        category: "Politics",
        markets: [{ gammaId: "market-inside", endDate: "2026-01-15T18:00:00.000Z" }]
      },
      {
        gammaId: "event-2",
        title: "Sports",
        category: "Sports",
        markets: [{ gammaId: "sports-inside", endDate: "2026-01-15T03:00:00.000Z" }]
      }
    ]);
  });
});
