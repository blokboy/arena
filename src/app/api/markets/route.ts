import { NextResponse } from "next/server";

import { marketCategoryFromSlug } from "@/domain/markets";
import { currentUserFromHeaders } from "@/server/current-user";
import { marketCacheRepository } from "@/server/markets";

export async function GET(request: Request) {
  const user = await currentUserFromHeaders(request.headers);
  if (!user) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }

  const url = new URL(request.url);
  const categorySlug = url.searchParams.get("category") ?? "politics";

  try {
    const category = marketCategoryFromSlug(categorySlug);
    return NextResponse.json({
      events: await marketCacheRepository.listEventsByCategory(category)
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_CATEGORY") {
      return NextResponse.json({ error: { code: "INVALID_CATEGORY" } }, { status: 400 });
    }

    throw error;
  }
}
