import { expect, test, type Locator, type Page } from "@playwright/test";

async function visibleInspector(
  page: Page,
  projectName: string,
): Promise<Locator> {
  if (projectName === "mobile-chrome") {
    await page.getByRole("button", { name: "Controls" }).click();
    const editor = page.getByRole("dialog", {
      name: "Objects and controls",
    });
    await expect(editor).toBeVisible();
    return editor;
  }

  return page.locator(".workspace .inspector");
}

async function enableAdvanced(inspector: Locator): Promise<void> {
  const toggle = inspector.getByRole("button", {
    name: "More planet controls",
  });
  if (await toggle.isVisible()) await toggle.click();
}

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
    await page.getByRole("button", { name: "Controls" }).click();
    const editor = page.getByRole("dialog", {
      name: "Objects and controls",
    });
    await editor.locator(".orbit-options button").first().click();
    await editor.getByRole("button", { name: "Close object controls" }).click();
  } else {
    await page.locator(".orbit-options button").first().click();
  }
  await expect(page.getByText("Give it a different orbit")).toBeHidden();

  await page.getByRole("button", { name: "Add object" }).click();
  await page.getByRole("button", { name: /^Planetary ring/ }).click();

  if (testInfo.project.name === "mobile-chrome") {
    await page.getByRole("button", { name: "Controls" }).click();
  }
  await page
    .getByRole("button", { name: "Edit circular pattern", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: /pattern$/ })).toBeVisible();
  await page.getByRole("button", { name: /^Step 2(?:, active)?$/ }).click();
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

test("contains modal focus, closes with Escape, and restores its trigger", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Explore the demo" }).click();
  const menuTrigger = page.getByRole("button", { name: "Open project menu" });
  await menuTrigger.click();

  const close = page.getByRole("button", { name: "Close project menu" });
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "System menu" })).toBeHidden();
  await expect(menuTrigger).toBeFocused();
});

test("restores visual comfort preferences", async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem("cosmic-quality", "low");
    localStorage.setItem("cosmic-reduced-effects", "true");
    localStorage.setItem("cosmic-reduced-flash", "true");
  });
  await page.reload();
  await page.getByRole("button", { name: "Explore the demo" }).click();
  await page.getByRole("button", { name: "Open project menu" }).click();

  await expect(page.getByLabel("Quality")).toHaveValue("low");
  await expect(
    page.getByText(
      "High detail adds terrain normals, stellar lighting, bloom, and deep space scenery.",
      { exact: false },
    ),
  ).toBeVisible();
  await page.getByLabel("Quality").selectOption("high");
  await expect(page.getByLabel("Quality")).toHaveValue("high");
  await expect(
    page.getByRole("checkbox", { name: "Reduce particles and motion" }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Reduce event flashes" }),
  ).toBeChecked();
});

test("updates tempo continuously while the slider moves", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium");
  await page.getByRole("button", { name: "Explore the demo" }).click();

  const tempo = page.getByLabel("Tempo");
  await expect(tempo).toBeVisible();
  // Explore waits for the browser's audio unlock before installing the demo.
  // Do not race a pointer edit against that intentional async handoff.
  await expect(tempo).toHaveValue("115");
  const bounds = await tempo.boundingBox();
  if (!bounds) throw new Error("Tempo slider must have pointer bounds.");
  const y = bounds.y + bounds.height / 2;
  const currentX = bounds.x + bounds.width * ((115 - 70) / (140 - 70));
  await page.mouse.move(currentX, y);
  await page.mouse.down();
  try {
    await page.mouse.move(bounds.x + bounds.width * 0.78, y, { steps: 4 });
    await expect.poll(() => tempo.inputValue()).not.toBe("115");
    const firstLiveValue = await tempo.inputValue();
    await expect(page.locator(".tempo-control output")).toHaveText(
      firstLiveValue,
    );

    // The second value must commit while the pointer is still held down.
    await page.mouse.move(bounds.x + bounds.width * 0.9, y, { steps: 4 });
    await expect.poll(() => tempo.inputValue()).not.toBe(firstLiveValue);
    await expect(page.locator(".tempo-control output")).toHaveText(
      await tempo.inputValue(),
    );
  } finally {
    await page.mouse.up();
  }
});

test("offers the full semantic editor on mobile", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chrome");
  await page.getByRole("button", { name: "Explore the demo" }).click();
  await page.getByRole("button", { name: "Controls" }).click();
  await expect(
    page.getByRole("heading", { name: "Objects and controls" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /, bass role,/ }).click();
  const mute = page.getByRole("button", { name: "Mute", exact: true });
  await mute.click();
  await expect(mute).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: /, bass role,.*muted/ }),
  ).toBeVisible();
});

test("shows a simple-mode sound choice for every planet role", async ({
  page,
}, testInfo) => {
  await page.getByRole("button", { name: "Explore the demo" }).click();
  const inspector = await visibleInspector(page, testInfo.project.name);
  const objectScope =
    testInfo.project.name === "mobile-chrome" ? inspector : page;

  for (const role of ["beat", "bass", "chords", "melody", "texture"]) {
    const objectButton = objectScope.getByRole("button", {
      name: new RegExp(`, ${role} role,`),
    });
    if (testInfo.project.name === "mobile-chrome") {
      await objectButton.focus();
      await objectButton.press("Enter");
    } else {
      await objectButton.click();
    }
    const soundGroup = inspector.getByRole("group", { name: "Sound" });
    await expect(soundGroup).toBeVisible();
    await expect(soundGroup.getByLabel("Instrument or kit")).toBeVisible();
  }
});

test("switches built-in sounds and imports a pitch-analysed local sample", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium");
  await page.getByRole("button", { name: "Explore the demo" }).click();
  await page.getByRole("button", { name: /, melody role,/ }).click();
  const inspector = page.locator(".workspace .inspector");
  const sound = inspector.getByLabel("Instrument or kit");

  await expect(sound).toBeVisible();
  await expect(sound.locator("option")).toHaveCount(6);
  await sound.selectOption("deep-signal");
  await expect(sound).toHaveValue("deep-signal");
  await expect(inspector.locator(".selected-sound strong")).toHaveText(
    "Deep Signal",
  );

  await inspector.getByText("Use your own sample", { exact: true }).click();
  await inspector.getByLabel("Sound name").fill("My C Signal");
  await inspector
    .getByLabel("Audio sample")
    .setInputFiles("public/audio/cosmic-samples/warm-pad-space-c4.ogg");
  const importStatus = inspector.locator(".import-status");
  await expect(importStatus).toContainText("Detected C4");
  await expect(inspector.getByLabel("Source note")).toHaveValue("60");
  await inspector
    .getByRole("button", { name: "Add and use this sound" })
    .click();
  await expect(importStatus).toContainText(
    "Sound added and kept in this browser.",
  );
  await expect(sound.locator("option:checked")).toHaveText("My C Signal");

  await page.getByRole("button", { name: /, beat role,/ }).click();
  await inspector.getByText("Build your own drum kit", { exact: true }).click();
  await inspector
    .getByLabel("Kick")
    .setInputFiles("public/audio/cosmic-samples/techno-kick.ogg");
  await inspector.getByRole("button", { name: "Add and use this kit" }).click();
  await expect(inspector.locator(".import-status")).toContainText(
    "Drum kit added and kept in this browser.",
  );
  await expect(
    inspector.getByLabel("Instrument or kit").locator("option:checked"),
  ).toHaveText("My beat sound");

  await page.evaluate(() =>
    localStorage.removeItem("cosmic-onboarding-version"),
  );
  await page.reload();
  await page.getByRole("button", { name: "Explore the demo" }).click();
  await page.getByRole("button", { name: /, melody role,/ }).click();
  await expect(
    inspector.getByLabel("Instrument or kit").locator("option", {
      hasText: "My C Signal",
    }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: /, beat role,/ }).click();
  await expect(
    inspector.getByLabel("Instrument or kit").locator("option", {
      hasText: "My beat sound",
    }),
  ).toHaveCount(1);
});

test("shapes chord voicing and melody direction in the semantic inspector", async ({
  page,
}, testInfo) => {
  await page.getByRole("button", { name: "Explore the demo" }).click();
  const inspector = await visibleInspector(page, testInfo.project.name);
  const objectScope =
    testInfo.project.name === "mobile-chrome" ? inspector : page;

  await objectScope.getByRole("button", { name: /, chords role,/ }).click();
  await enableAdvanced(inspector);
  const voicing = inspector.getByLabel("Voicing");
  const chordComplexity = inspector.getByLabel("Chord complexity");
  await expect(voicing).toBeVisible();
  await expect(chordComplexity).toBeVisible();
  await voicing.press("End");
  await expect(voicing).toHaveValue("1");
  await expect(
    inspector.locator(`output[for="${await voicing.getAttribute("id")}"]`),
  ).toHaveText("Wide");

  await objectScope.getByRole("button", { name: /, melody role,/ }).click();
  const pitchVariety = inspector.getByLabel("Pitch variety");
  await expect(pitchVariety).toBeVisible();
  await pitchVariety.press("End");
  await expect(pitchVariety).toHaveValue("1");
  await inspector.getByRole("button", { name: "Descend" }).click();
  await expect(
    inspector.getByRole("button", { name: "Descend" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("controls the density of a selected planet ring", async ({
  page,
}, testInfo) => {
  await page.getByRole("button", { name: "Explore the demo" }).click();
  let inspector = await visibleInspector(page, testInfo.project.name);
  const objectScope =
    testInfo.project.name === "mobile-chrome" ? inspector : page;

  await objectScope.getByRole("button", { name: /, chords role,/ }).click();
  await inspector.getByRole("button", { name: "Add rhythmic ring" }).click();
  if (testInfo.project.name === "mobile-chrome") {
    inspector = await visibleInspector(page, testInfo.project.name);
  }

  const density = inspector.getByLabel("Ring density");
  await expect(density).toBeVisible();
  await expect(density).toHaveValue("16");
  await density.press("ArrowLeft");
  await expect(density).toHaveValue("15");
  await density.fill("4");
  await expect(density).toHaveValue("4");
  await expect(inspector.locator(".ring-density-control output")).toHaveText(
    "4",
  );
});

test("keeps the groove running through a live-control edit storm", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium");
  test.setTimeout(60_000);
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });

  await page.getByRole("button", { name: "Explore the demo" }).click();
  const pause = page.getByRole("button", { name: "Pause composition" });
  await expect(pause).toBeVisible();
  await expect(page.locator(".scene-status")).toContainText("In orbit");

  const streamRange = async (
    slider: ReturnType<typeof page.locator>,
    values: readonly string[],
  ) => {
    for (const value of values) await slider.fill(value);
    await expect(pause).toBeVisible();
  };

  await streamRange(page.getByLabel("Tempo"), ["96", "128", "84", "121"]);
  await page.getByRole("button", { name: "Show 6 advanced controls" }).click();
  const macros = page.locator('.macro-knob input[type="range"]');
  await expect(macros).toHaveCount(6);
  for (let index = 0; index < 6; index += 1) {
    await streamRange(macros.nth(index), ["0.12", "0.88", "0.34", "0.67"]);
  }

  await page.getByRole("button", { name: /, chords role,/ }).click();
  const inspector = page.locator(".workspace .inspector");
  await streamRange(inspector.getByLabel("Chord complexity"), [
    "0.1",
    "0.9",
    "0.25",
    "0.75",
  ]);
  await streamRange(inspector.getByLabel("Voicing"), ["0", "1", "0.5"]);

  await inspector
    .getByRole("button", { name: "Edit circular pattern" })
    .click();
  const pattern = page.getByRole("dialog", { name: /pattern/ });
  await pattern.getByRole("button", { name: /^Step 2(?:, active)?$/ }).click();
  await pattern.getByRole("button", { name: /^Step 3(?:, active)?$/ }).click();
  await pattern.getByRole("button", { name: /^Step 2(?:, active)?$/ }).click();
  await pattern.getByRole("button", { name: /^Step 4(?:, active)?$/ }).click();
  await expect(pause).toBeVisible();
  await pattern.getByRole("button", { name: "Close pattern editor" }).click();

  await inspector.getByRole("button", { name: "Add rhythmic ring" }).click();
  await streamRange(inspector.getByLabel("Ring density"), [
    "2",
    "15",
    "5",
    "12",
  ]);
  await page.getByRole("button", { name: /, melody role,/ }).click();
  await streamRange(inspector.getByLabel("Pitch variety"), [
    "0.08",
    "0.92",
    "0.31",
    "0.69",
  ]);

  await expect(page.locator(".scene-status")).toContainText("In orbit");
  await pause.click();
  await expect(
    page.getByRole("button", { name: "Play composition" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stop composition" }).click();
  expect(runtimeErrors).toEqual([]);
});

test("deletes a planet with clear feedback and restores it with undo", async ({
  page,
}, testInfo) => {
  const exploreDemo = page.getByRole("button", { name: "Explore the demo" });
  await exploreDemo.click();
  await expect(exploreDemo).toBeHidden();
  const inspector = await visibleInspector(page, testInfo.project.name);
  await enableAdvanced(inspector);
  const planetName =
    (await inspector.locator(".selected-summary h2").textContent()) ?? "";
  expect(planetName).not.toBe("");

  await inspector
    .getByRole("button", { name: `Delete ${planetName} planet` })
    .click();

  await expect(
    page.getByText(`${planetName} was blown out of orbit. Undo restores it.`),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Objects and controls" }),
  ).toBeHidden();

  await page.getByRole("button", { name: "Undo" }).click();
  let objectScope: Locator;
  if (testInfo.project.name === "mobile-chrome") {
    await page.getByRole("button", { name: "Controls" }).click();
    objectScope = page.getByRole("dialog", { name: "Objects and controls" });
  } else {
    objectScope = page.locator(".workspace");
  }
  await expect(
    objectScope
      .locator(".object-row strong")
      .filter({ hasText: planetName })
      .first(),
  ).toBeVisible();
});

test("offers bounded scene zoom, rotation, tilt, and reset controls", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Explore the demo" }).click();

  const controls = page.getByRole("group", { name: "Scene view controls" });
  await expect(controls).toBeVisible();
  await expect(controls).toHaveAttribute("data-zoom", "100");
  await expect(controls).toHaveAttribute("data-rotation", "0");
  await expect(controls).toHaveAttribute("data-tilt", "40");
  await expect(page.getByLabel("Scene zoom 100%")).toBeVisible();
  await expect(page.getByLabel("Scene tilt 40 degrees")).toBeVisible();

  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(controls).toHaveAttribute("data-zoom", "110");
  await expect(page.getByLabel("Scene zoom 110%")).toBeVisible();

  await page.getByRole("button", { name: "Rotate right" }).click();
  await expect(controls).toHaveAttribute("data-rotation", "15");

  await page.getByRole("button", { name: "Tilt up" }).click();
  await expect(controls).toHaveAttribute("data-tilt", "50");
  await expect(page.getByLabel("Scene tilt 50 degrees")).toBeVisible();
  await page.getByRole("button", { name: "Tilt down" }).click();
  await expect(controls).toHaveAttribute("data-tilt", "40");

  await page.getByRole("button", { name: "Tilt down" }).click();
  await expect(controls).toHaveAttribute("data-tilt", "30");

  await page.getByRole("button", { name: "Reset view" }).click();
  await expect(controls).toHaveAttribute("data-zoom", "100");
  await expect(controls).toHaveAttribute("data-rotation", "0");
  await expect(controls).toHaveAttribute("data-tilt", "40");
  await expect(page.getByRole("button", { name: "Reset view" })).toBeDisabled();
});

test("shows a 3-bar orbit and exports one complete 12-bar sync", async ({
  page,
}, testInfo) => {
  const exploreDemo = page.getByRole("button", { name: "Explore the demo" });
  await exploreDemo.click();
  await expect(exploreDemo).toBeHidden();

  const inspector = await visibleInspector(page, testInfo.project.name);
  await enableAdvanced(inspector);
  const deeperRates = inspector.getByLabel("More orbit rates");
  await deeperRates.selectOption("3");
  await expect(deeperRates).toHaveValue("3");
  await expect(inspector.locator(".orbit-current strong")).toHaveText("3 bars");
  await expect(inspector.getByText("System sync · 12 bars")).toBeVisible();

  if (testInfo.project.name === "mobile-chrome") {
    await page.getByRole("button", { name: "Close object controls" }).click();
  }

  await page.getByRole("button", { name: "Open project menu" }).click();
  await page.getByRole("button", { name: "Export audio or MIDI" }).click();

  const exportDialog = page.getByRole("dialog", { name: "Export this system" });
  await expect(exportDialog.getByText("12-bar super-loop")).toBeVisible();
  await expect(exportDialog.getByText(/12 bars ·/)).toBeVisible();
  await expect(exportDialog.getByText("1 complete super-loop")).toBeVisible();
  await expect(
    exportDialog.getByRole("button", { name: "1×" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("renders a real bounded WAV export in the browser", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium");
  await page.getByRole("button", { name: "Explore the demo" }).click();
  await page.getByRole("button", { name: "Open project menu" }).click();
  await page.getByRole("button", { name: "Export audio or MIDI" }).click();

  const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByRole("button", { name: /WAV audio/ }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/\.wav$/i);
  expect(await download.failure()).toBeNull();
});

test("zooms the scene with a desktop wheel gesture", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium");
  await page.getByRole("button", { name: "Explore the demo" }).click();

  const controls = page.getByRole("group", { name: "Scene view controls" });
  await page.locator(".cosmic-canvas").hover();
  await page.mouse.wheel(0, -120);
  await expect(controls).not.toHaveAttribute("data-zoom", "100");
});

test("keeps material identity, gate presets, and Orbit Lab connected", async ({
  page,
}, testInfo) => {
  await page.getByRole("button", { name: "Explore the demo" }).click();

  const overlay = page.locator(".scene-polish-overlay");
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute(
    "data-role",
    /^(beat|bass|chords|melody|texture)$/,
  );
  await expect(
    overlay.locator(".scene-material-identity strong"),
  ).not.toBeEmpty();
  await expect(overlay).toContainText("Tap a slot to turn it on or off");
  await expect(overlay).toContainText("Radial drag · change loop");
  await expect(overlay).toContainText("Arc drag · rotate gates");

  const materialByRole = {
    beat: "Impact terrain",
    bass: "Tidal bands",
    chords: "Harmonic strata",
    melody: "Signal currents",
    texture: "Dust-cloud crust",
  } as const;
  const role = (await overlay.getAttribute(
    "data-role",
  )) as keyof typeof materialByRole;
  await expect(overlay).toContainText(materialByRole[role]);

  let inspector = await visibleInspector(page, testInfo.project.name);
  let gateRhythm = inspector.getByLabel("Gate rhythm");
  await expect(gateRhythm).toBeVisible();
  expect(await gateRhythm.evaluate((element) => element.tagName)).toBe(
    "SELECT",
  );

  await gateRhythm.selectOption("syncopated");
  await expect(gateRhythm).toHaveValue("syncopated");
  await expect(gateRhythm.locator("option:checked")).toHaveText("Syncopated");

  await inspector
    .getByRole("button", { name: "Edit circular pattern", exact: true })
    .click();
  await expect(page.getByText("Orbit Lab", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /pattern$/ })).toBeVisible();
  await expect(
    page.getByText(
      "Fine-tune individual orbit gates. A bright gate pulses when its event plays.",
    ),
  ).toBeVisible();

  const pattern = page.getByRole("dialog", { name: /pattern/ });
  await pattern.getByRole("button", { name: "Step 2", exact: true }).click();
  await pattern.getByRole("button", { name: "Close pattern editor" }).click();

  inspector = await visibleInspector(page, testInfo.project.name);
  gateRhythm = inspector.getByLabel("Gate rhythm");
  await expect(gateRhythm).toHaveValue("custom");
  await expect(gateRhythm.locator("option:checked")).toHaveText(
    "Custom orbit gates",
  );
});

test("starts with simple controls and exposes both levels of safe surprise", async ({
  page,
}, testInfo) => {
  const welcomeSurprise = page
    .locator(".onboarding-enter")
    .getByRole("button", { name: /^Surprise me/ });
  await expect(welcomeSurprise).toBeVisible();
  await welcomeSurprise.click();

  await expect(
    page.getByRole("button", { name: /Surprise me whole system/ }),
  ).toBeVisible();
  await expect(page.locator('.macro-knob input[type="range"]')).toHaveCount(3);

  const advancedToggle = page.getByRole("button", {
    name:
      testInfo.project.name === "mobile-chrome"
        ? "Advanced"
        : "Show 6 advanced controls",
  });
  await advancedToggle.click();
  await expect(page.locator('.macro-knob input[type="range"]')).toHaveCount(6);

  const inspector = await visibleInspector(page, testInfo.project.name);
  const planetSurprise = inspector
    .getByRole("button", {
      name: /Surprise this planet/,
    })
    .first();
  await expect(planetSurprise).toBeVisible();
  await planetSurprise.click();
  await expect(page.getByText(/has a new safe musical idea/)).toBeVisible();
});

test("changes orbit detail from clear beats to advanced polyrhythms", async ({
  page,
}, testInfo) => {
  await page.getByRole("button", { name: "Explore the demo" }).click();
  const inspector = await visibleInspector(page, testInfo.project.name);

  const expectStepChoices = async (
    visible: readonly number[],
    absent: readonly number[],
  ) => {
    for (const steps of visible) {
      await expect(
        inspector.getByRole("button", { name: `${steps} steps`, exact: true }),
      ).toBeVisible();
    }
    for (const steps of absent) {
      await expect(
        inspector.getByRole("button", { name: `${steps} steps`, exact: true }),
      ).toHaveCount(0);
    }
  };

  await expectStepChoices([8, 16], [4, 32]);
  await inspector.getByRole("button", { name: "½ bar orbit rate" }).click();
  await expectStepChoices([4, 8], [16, 32]);

  await inspector.getByRole("button", { name: "2 bars orbit rate" }).click();
  await expectStepChoices([8, 16], [4, 32]);

  await inspector.getByRole("button", { name: "4 bars orbit rate" }).click();
  await expectStepChoices([8, 16, 32], [4]);

  await enableAdvanced(inspector);
  const deeperRates = inspector.getByLabel("More orbit rates");
  await deeperRates.selectOption("1.5");
  for (const steps of [6, 12]) {
    await expect(
      inspector.getByRole("button", {
        name: `${steps} polyrhythm steps`,
        exact: true,
      }),
    ).toBeVisible();
  }
  await expect(
    inspector.getByRole("button", {
      name: "24 polyrhythm steps",
      exact: true,
    }),
  ).toHaveCount(0);

  await deeperRates.selectOption("3");
  for (const steps of [12, 24]) {
    await expect(
      inspector.getByRole("button", {
        name: `${steps} polyrhythm steps`,
        exact: true,
      }),
    ).toBeVisible();
  }
  await expect(
    inspector.getByRole("button", {
      name: "6 polyrhythm steps",
      exact: true,
    }),
  ).toHaveCount(0);
  await inspector
    .getByRole("button", { name: "12 polyrhythm steps", exact: true })
    .click();
  await inspector
    .getByRole("button", { name: "Edit circular pattern" })
    .click();

  const pattern = page.getByRole("dialog", { name: /pattern/ });
  await expect(pattern.locator(".linear-pattern button")).toHaveCount(12);
  await expect(
    pattern.getByRole("button", { name: /^Step 1(?:, active)?$/ }),
  ).toHaveAttribute("aria-description", "Main beat");
});

test("offers keyboard pitch nudges for melodic gates", async ({
  page,
}, testInfo) => {
  await page.getByRole("button", { name: "Explore the demo" }).click();
  let melody = page.getByRole("button", { name: /, melody role,/ });
  if (testInfo.project.name === "mobile-chrome") {
    await page.getByRole("button", { name: "Controls" }).click();
    melody = page
      .getByRole("dialog", { name: "Objects and controls" })
      .getByRole("button", { name: /, melody role,/ });
  }
  await melody.click();
  const inspector =
    testInfo.project.name === "mobile-chrome"
      ? page.getByRole("dialog", { name: "Objects and controls" })
      : page.locator(".workspace .inspector");
  await inspector
    .getByRole("button", { name: "Edit circular pattern" })
    .click();
  const pitchUp = page
    .getByRole("button", { name: /Raise gate \d+ pitch/ })
    .first();
  await expect(pitchUp).toBeVisible();
  await pitchUp.focus();
  await page.keyboard.press("Enter");
  await expect(pitchUp).toBeFocused();
});
