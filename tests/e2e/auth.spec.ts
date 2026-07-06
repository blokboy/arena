import { expect, test } from "@playwright/test";

test("user can register, log out, and log back in through the UI", async ({ page }) => {
  const username = `e2e-${Date.now()}`;
  const password = "long-enough";

  await page.goto("/signup");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL("/markets");
  await expect(page.getByText(`Signed in as ${username}`)).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();

  await expect(page).toHaveURL("/login");
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();

  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page).toHaveURL("/markets");
  await expect(page.getByText(`Signed in as ${username}`)).toBeVisible();
});
