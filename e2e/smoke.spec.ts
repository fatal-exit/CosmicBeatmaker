import { expect, test } from "@playwright/test";

test("loads the responsive Cosmic Beatmaker shell", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "First Light" }),
  ).toBeVisible();
  await expect(
    page.getByText("Cosmic Beatmaker", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Cosmic instrument scene placeholder" }),
  ).toBeVisible();
});
