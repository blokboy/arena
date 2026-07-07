"use client";

import React, { useEffect, useState } from "react";

import { MarketsBrowser } from "@/components/markets/markets-browser";
import { CATEGORY_TAGS, type CachedEvent, type MarketCategory } from "@/domain/markets";

type RequestStatus = "loading" | "success" | "error";

export function MarketsClient() {
  const [selectedCategory, setSelectedCategory] = useState<MarketCategory>("Politics");
  const [events, setEvents] = useState<CachedEvent[]>([]);
  const [status, setStatus] = useState<RequestStatus>("loading");

  useEffect(() => {
    let active = true;

    setStatus("loading");
    fetch(`/api/markets?category=${CATEGORY_TAGS[selectedCategory].slug}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("MARKETS_REQUEST_FAILED");
        }
        return response.json() as Promise<{ events: CachedEvent[] }>;
      })
      .then((body) => {
        if (!active) {
          return;
        }
        setEvents(body.events);
        setStatus("success");
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setEvents([]);
        setStatus("error");
      });

    return () => {
      active = false;
    };
  }, [selectedCategory]);

  return (
    <MarketsBrowser
      events={events}
      selectedCategory={selectedCategory}
      status={status}
      onCategoryChange={setSelectedCategory}
    />
  );
}
