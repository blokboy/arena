import { expect, test } from "@playwright/test";

test("leaderboard ranks every user, keeps MEAN synthetic and separate, and surfaces parlay discovery", async ({
  page,
  request
}) => {
  const username = `e2e-board-${Date.now()}`;
  const password = "long-enough";

  // Register the primary actor through the UI (starting balance 1,000).
  await page.goto("/signup");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/markets");

  // Seed a second, dormant signup directly via the API using an isolated
  // request context (the top-level `request` fixture, not `page.request`)
  // so it doesn't clobber the page's own session cookie.
  // Kept short: the username regex caps at 24 chars (`^[a-z0-9_-]{3,24}$`),
  // and this prefix + Date.now()'s 13 digits must fit under that.
  const dormantUsername = `e2e-dorm-${Date.now()}`;
  const dormantResponse = await request.post("/api/auth/register", {
    data: { username: dormantUsername, password, confirmPassword: password }
  });
  expect(dormantResponse.ok()).toBe(true);

  // Seed the browse cache so a market exists to buy from, same pattern as
  // tests/e2e/buy-position.spec.ts.
  const sync = await page.request.get("/api/cron/markets", {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` }
  });
  expect(sync.ok()).toBe(true);

  // Make the primary actor "active" by buying a position — this is what
  // should get them counted into MEAN, not any change to the dormant user.
  await page.goto("/markets");
  await page
    .getByRole("button", { name: /Show markets for / })
    .first()
    .click();
  await page.getByRole("link", { name: "View market" }).first().click();
  await page.getByRole("button", { name: /Yes/ }).first().click();
  await page.getByLabel("Stake", { exact: true }).fill("100");
  await page.getByRole("button", { name: /^Buy/ }).click();
  await expect(page.getByText(/Bought .+ shares/)).toBeVisible();
  await expect(page.getByText("Balance 900")).toBeVisible();

  await page.goto("/leaderboard");

  // Real semantic table (a11y flag #6), with both real users listed as rows.
  const table = page.getByRole("table");
  await expect(table).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(username) })).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(dormantUsername) })).toBeVisible();

  // The caller can find their own row without scanning ranks.
  const callerRow = page.getByRole("row", { name: new RegExp(username) });
  await expect(callerRow.getByText(/you/i)).toBeVisible();

  // MEAN is a distinct, labeled, synthetic row — never a competing "user".
  await expect(page.getByText("MEAN")).toBeVisible();
  await expect(
    page.getByText("Live average balance across all users — not a real account.")
  ).toBeVisible();
  const meanRow = page.getByRole("row", { name: /not a real account/i });
  await expect(meanRow).toBeVisible();
  await expect(meanRow.getByText(dormantUsername)).toHaveCount(0);

  // Random-parlay discovery is a separate, clearly labeled section — not a
  // leaderboard row, and it must not visually compete with MEAN/ranking.
  const discovery = page.getByRole("region", { name: /discover parlays|random parlays/i });
  await expect(discovery).toBeVisible();
  await expect(discovery.getByRole("row")).toHaveCount(0);
});
