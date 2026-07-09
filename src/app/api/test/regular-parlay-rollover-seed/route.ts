import { NextResponse } from "next/server";

import { seedDecisiveRegularParlayRollover } from "@/server/testing/seed-regular-parlay-rollover";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  const data = await seedDecisiveRegularParlayRollover();
  return NextResponse.json({ data }, { status: 201 });
}
