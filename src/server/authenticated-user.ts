import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { currentUserFromHeaders } from "@/server/current-user";

export async function currentUserOrRedirect() {
  const user = await currentUserFromHeaders(await headers());

  if (!user) {
    redirect("/login");
  }

  return {
    id: user.id,
    username: user.username,
    balance: user.balance,
    showStartingBalance: !user.hasSeenStartingBalanceBanner
  };
}
