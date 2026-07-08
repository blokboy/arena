import { expect, test } from "@playwright/test";

test("user buys a position, then sells it from the portfolio page", async ({ page }) => {
  const username = `e2e-seller-${Date.now()}`;
  const password = "long-enough";

  // Register.
  await page.goto("/signup");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL("/markets");
  await expect(page.getByText("Balance 1,000")).toBeVisible();

  // Seed the browse cache.
  const sync = await page.request.get("/api/cron/markets", {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` }
  });
  expect(sync.ok()).toBe(true);

  // Browse to the first cached market's detail page and buy 100 points.
  await page.goto("/markets");
  await page
    .getByRole("button", { name: /Show markets for / })
    .first()
    .click();
  await page.getByRole("link", { name: "View market" }).first().click();
  await expect(page).toHaveURL(/\/markets\/.+/);

  await page.getByRole("button", { name: /Yes/ }).first().click();
  await page.getByLabel("Stake", { exact: true }).fill("100");
  await page.getByRole("button", { name: /^Buy/ }).click();

  await expect(page.getByText(/Bought .+ shares/)).toBeVisible();
  await expect(page.getByText("Balance 900")).toBeVisible();

  // Navigate to portfolio and see the open position.
  await page.getByRole("link", { name: "Portfolio" }).click();
  await expect(page).toHaveURL("/portfolio");
  await expect(page.getByRole("heading", { name: "Open positions" })).toBeVisible();

  // The open position group should appear.
  await expect(page.getByRole("heading", { name: "Open positions" }).first()).toBeVisible();

  // Sell the position via sell-all. The E2E buys only one lot on the first
  // cached outcome, so "Sell all available" closes it in one click.
  const sellAllButton = page.getByRole("button", { name: "Sell all available" }).first();
  await expect(sellAllButton).toBeVisible();
  await sellAllButton.click();

  // The confirmation dialog appears.
  await expect(page.getByText("Sell all available shares?")).toBeVisible();

  // Confirm the sell.
  await page.getByRole("button", { name: "Sell all available" }).click();

  // The portfolio should show sell feedback.
  await expect(page.getByText(/Sold/)).toBeVisible({ timeout: 10000 });
});
