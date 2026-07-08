import { expect, test } from "@playwright/test";

test("user creates a regular parlay with a locked roster and an atomic first leg", async ({
  page,
  request
}) => {
  // Kept short: the username regex caps at 24 chars (`^[a-z0-9_-]{3,24}$`),
  // and these prefixes + Date.now()'s 13 digits must fit under that.
  const creatorUsername = `e2e-owner-${Date.now()}`;
  const password = "long-enough";

  // Register the creator through the UI (starting balance 1,000).
  await page.goto("/signup");
  await page.getByLabel("Username").fill(creatorUsername);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/markets");

  // Seed a second, invitable user via an isolated request context (doesn't
  // touch the page's own session cookie). Kept short: usernames cap at 24
  // chars (`^[a-z0-9_-]{3,24}$`).
  const inviteeUsername = `e2e-inv-${Date.now()}`;
  const inviteeResponse = await request.post("/api/auth/register", {
    data: { username: inviteeUsername, password, confirmPassword: password }
  });
  expect(inviteeResponse.ok()).toBe(true);

  // Seed the browse cache so a market exists to buy from, same pattern as
  // tests/e2e/buy-position.spec.ts.
  const sync = await page.request.get("/api/cron/markets", {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` }
  });
  expect(sync.ok()).toBe(true);

  // The creator needs an already-purchased lot to commit into leg 1 —
  // ADR-0001: there is no such thing as a leg without its first stake. A
  // larger stake keeps the resulting share count comfortably above the 1
  // share we'll commit below, regardless of the live market's price.
  await page.goto("/markets");
  await page
    .getByRole("button", { name: /Show markets for / })
    .first()
    .click();
  await page.getByRole("link", { name: "View market" }).first().click();
  await page.getByRole("button", { name: /Yes/ }).first().click();
  await page.getByLabel("Stake", { exact: true }).fill("500");
  await page.getByRole("button", { name: /^Buy/ }).click();
  await expect(page.getByText(/Bought .+ shares/)).toBeVisible();

  // --- Step 1: roster ---
  await page.goto("/parlays/new");
  await expect(
    page.getByText("Members can't be added later — only added members can append legs.")
  ).toBeVisible();

  const parlayName = `E2E ladder ${Date.now()}`;
  await page.getByLabel("Parlay name").fill(parlayName);
  await page.getByPlaceholder("Search by username").fill(inviteeUsername.slice(0, 6));
  await page.getByRole("button", { name: `Add ${inviteeUsername}` }).click();
  await page.getByRole("button", { name: "Continue to first leg" }).click();

  // --- Step 2: first leg — market/outcome pick reuses the same
  // MarketRow-style browsing as /markets (PRD Part IV §1), scoped to
  // Politics by default. ---
  await expect(page.getByRole("heading", { name: "First leg", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Choose market" }).first().click();

  const outcomeGroup = page.getByRole("group", { name: "Outcome" });
  await outcomeGroup.getByRole("button", { name: /^Yes/ }).click();

  await expect(page.getByText(/committed shares are locked immediately/i)).toBeVisible();

  const shareInput = page.getByLabel(/Shares to commit for/i).first();
  await shareInput.fill("1");

  await page.getByRole("button", { name: "Create parlay" }).click();

  // --- Confirm dialog (irreversible-consequence moment, PRD accessibility
  // flag #3): locked-share + HOUSE-risk copy, then the actual confirm. ---
  const dialog = page.getByRole("dialog", { name: "Commit shares to leg 1?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/locked into this parlay/i)).toBeVisible();
  await expect(dialog.getByText(/lost to house/i)).toBeVisible();
  await dialog.getByRole("button", { name: "Create parlay" }).click();

  // Success: redirected to /parlays, where the new parlay is now listed —
  // and, independently of the UI, the committed share is locked server-side.
  await expect(page).toHaveURL("/parlays");
  await expect(page.getByRole("heading", { name: parlayName })).toBeVisible();
  await expect(page.getByText(/2 members/)).toBeVisible();

  const positionsResponse = await page.request.get("/api/positions");
  const { positions } = (await positionsResponse.json()) as {
    positions: Array<{ committedShares: string }>;
  };
  const committedLot = positions.find((p) => Number(p.committedShares) > 0);
  expect(committedLot?.committedShares).toBe("1");
});
