import { expect, test } from "@playwright/test";

import { seedDecisiveRegularParlayRollover } from "./helpers/seed-regular-parlay-rollover";

test("member cast of the decisive rollover vote shows preview copy and advances the parlay", async ({
  page,
  request
}) => {
  const seeded = await seedDecisiveRegularParlayRollover(request);

  await page.goto("/login");
  await page.getByLabel("Username").fill(seeded.alice.username);
  await page.getByLabel("Password", { exact: true }).fill(seeded.alice.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL("/markets");

  await page.goto(`/parlays/${seeded.parlayId}`);
  await expect(page.getByText(`Currently live: ${seeded.currentQuestion}`)).toBeVisible();

  await page.getByRole("switch", { name: "Vote to roll over" }).click();

  const dialog = page.getByRole("dialog", { name: "Confirm rollover vote" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText(
      "Your vote alone will trigger this rollover for the entire leg, including other members' and backers' stakes."
    )
  ).toBeVisible();
  await expect(dialog.getByText("Stop-loss preview")).toBeVisible();
  await expect(dialog.getByText("0.55")).toBeVisible();
  await expect(dialog.getByText("0.25")).toBeVisible();
  await expect(dialog.getByText("220")).toBeVisible();

  await dialog.getByRole("button", { name: "Confirm vote" }).click();

  await expect(page.getByText(`Currently live: ${seeded.nextQuestion}`)).toBeVisible();

  const response = await page.request.get(`/api/parlays/${seeded.parlayId}`);
  const body = (await response.json()) as {
    data: {
      legs: Array<{ market: { question: string }; status: string }>;
    };
  };
  expect(body.data.legs[0]?.status).toBe("ROLLED_OVER");
  expect(body.data.legs[1]?.status).toBe("ACTIVE");
});
