import { expect, test } from "@playwright/test";

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
  // exact: true avoids a strict-mode collision with the Max button, whose
  // accessible name ("Set stake to maximum, N points") also contains "stake"
  // as a case-insensitive substring.
  await page.getByLabel("Stake", { exact: true }).fill("100");
  await page.getByRole("button", { name: /^Buy/ }).click();

  // Confirmation, then the balance drops by exactly the stake.
  await expect(page.getByText(/Bought .+ shares/)).toBeVisible();
  await expect(page.getByText("Balance 900")).toBeVisible();

  // The "View portfolio" link lands on /portfolio. Note: the portfolio page
  // itself is currently a static stub (src/app/(app)/portfolio/page.tsx never
  // reads positionRepository), so listing the purchased lot there is a
  // separate, not-yet-built feature outside this issue's scope — this only
  // asserts navigation succeeds, not that the lot is displayed.
  await page.goto("/portfolio");
  await expect(page.getByRole("heading", { name: "Portfolio" })).toBeVisible();
});
