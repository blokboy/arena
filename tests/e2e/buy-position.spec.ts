import { expect, test } from "@playwright/test";

// Unskip when Issue #4 (buy position lots from market detail) lands.
// Skipped so CI stays green if this suite merges before/with the feature.
// The buy-panel selectors below assume the accessible names sketched in
// tests/components/buy-panel.test.tsx and the design spec for Issue #4 —
// adjust them to the shipped UI when unskipping.
test.skip(true, "Issue #4 buy flow is not implemented yet");

test("user buys a position lot from market detail and sees balance and position update", async ({
  page
}) => {
  const username = `e2e-buyer-${Date.now()}`;
  const password = "long-enough";

  // Register (starting balance is 1,000 points).
  await page.goto("/signup");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL("/markets");
  await expect(page.getByText("Balance 1,000")).toBeVisible();

  // Seed the browse cache (dev server persists it in .arena-cache) so a
  // market detail exists to buy from. Requires CRON_SECRET in the e2e env.
  const sync = await page.request.get("/api/cron/markets", {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` }
  });
  expect(sync.ok()).toBe(true);

  // Browse to the first cached market's detail page.
  await page.goto("/markets");
  await page
    .getByRole("button", { name: /Show markets for / })
    .first()
    .click();
  await page.getByRole("link", { name: "View market" }).first().click();
  await expect(page).toHaveURL(/\/markets\/.+/);

  // Choose an outcome, stake 100 points, and buy at the shown bestAsk.
  await page.getByRole("button", { name: /Yes/ }).first().click();
  await page.getByLabel("Stake").fill("100");
  await page.getByRole("button", { name: /^Buy/ }).click();

  // Confirmation, then the balance drops by exactly the stake.
  await expect(page.getByText(/Bought .+ shares/)).toBeVisible();
  await expect(page.getByText("Balance 900")).toBeVisible();

  // The new lot is visible in the portfolio.
  await page.goto("/portfolio");
  await expect(page.getByText("100", { exact: false })).toBeVisible();
});
