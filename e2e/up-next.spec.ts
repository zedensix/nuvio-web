import { expect, test } from "@playwright/test";
import { collectRuntimeErrors } from "./errors.ts";
import { serveFixtures } from "./fixtures.ts";

// The up-next card, driven through the `/dev/player` harness : the shared test
// account has no stream addon, so the real player route can't resolve a video.
const SAMPLE = "/e2e/sample.webm";

test.beforeEach(({ context }) => serveFixtures(context));

test("up-next card counts down, then plays the next episode", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);

	await page.goto(`/dev/player?src=${SAMPLE}&upnext=2`);
	const card = page.getByRole("region", { name: "Up next" });
	await expect(card).toBeVisible();
	await expect(card.getByText("S1 E2", { exact: false })).toBeVisible();
	await expect(
		card.getByRole("heading", { name: "The Harness Strikes Back" }),
	).toBeVisible();
	await expect(card.getByText(/Playing in \ds/)).toBeVisible();
	await expect(card.getByRole("link", { name: "Home" })).toBeVisible();

	await expect(page.getByTestId("next-played")).toHaveText("next", {
		timeout: 5000,
	});
	await expect(card).toBeHidden();

	expect(errors, "runtime errors").toEqual([]);
});

test("up-next card without autoplay waits, and can be dismissed", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);

	await page.goto(`/dev/player?src=${SAMPLE}&upnext=0`);
	const card = page.getByRole("region", { name: "Up next" });
	await expect(card).toBeVisible();
	await expect(card.getByText(/Playing in/)).toBeHidden();

	await card.getByRole("button", { name: "Not now" }).click();
	await expect(card).toBeHidden();
	await expect(page.getByTestId("next-played")).toHaveText("");

	expect(errors, "runtime errors").toEqual([]);
});
