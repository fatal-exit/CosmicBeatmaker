import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("loads the responsive onboarding promise", async ({ page }) => {
  await expect(
    page.getByRole("heading", {
      name: "Your first beat is already in orbit.",
    }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Build a solar system. Make a beat. No music theory required.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start creating" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("completes the guided first-minute create and save flow", async ({
  page,
}, testInfo) => {
  await page.getByRole("button", { name: "Start creating" }).click();
  await expect(
    page.getByRole("heading", {
      name: "What should this system feel like?",
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: /^Radiant/ }).click();
  await expect(
    page.getByRole("region", { name: "Cosmic instrument scene" }),
  ).toBeVisible();
  await expect(page.getByText("Add a bass planet")).toBeVisible();

  await page.getByRole("button", { name: "Add bass" }).click();
  await page.getByRole("button", { name: /^Bass/ }).click();
  await expect(page.getByText("Give it a different orbit")).toBeVisible();

  if (testInfo.project.name === "mobile-chrome") {
    await page.getByLabel("Orbit length").selectOption("0.5");
  } else {
    await page.locator(".orbit-options button").first().click();
  }
  await expect(page.getByText("Give it a different orbit")).toBeHidden();

  await page.getByRole("button", { name: "Add object" }).click();
  await page.getByRole("button", { name: /^Planetary ring/ }).click();

  await page.getByRole("button", { name: /Edit.*pattern/ }).click();
  await expect(page.getByRole("heading", { name: /pattern$/ })).toBeVisible();
  await page.getByRole("button", { name: "Step 2", exact: true }).click();
  await page.getByRole("button", { name: "Close pattern editor" }).click();

  const saveButton = page.getByRole("button", { name: "Save", exact: true });
  if (await saveButton.isVisible()) {
    await saveButton.click();
  } else {
    await page.getByRole("button", { name: "Open project menu" }).click();
    await page.getByRole("button", { name: /^Save current system/ }).click();
  }
  await expect(page.getByText("Saved in this browser.")).toBeVisible();
});
