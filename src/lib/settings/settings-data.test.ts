import { afterEach, describe, expect, it, vi } from "vitest";
import type { NuvioClient } from "#lib/nuvio/index.js";
import {
	forgetShellSettings,
	pullSettingsBlob,
	pullShellSettings,
} from "./settings-data.ts";
import { DEFAULT_UI_SETTINGS } from "./ui-settings.ts";

function nuvioWith(result: unknown | Error): NuvioClient {
	return {
		settings: {
			pull: vi
				.fn()
				.mockImplementation(() =>
					result instanceof Error
						? Promise.reject(result)
						: Promise.resolve(result),
				),
		},
	} as unknown as NuvioClient;
}

describe("pullSettingsBlob", () => {
	it("returns the first blob's settings_json", async () => {
		const nuvio = nuvioWith([{ settings_json: { ui: { accent: "rose" } } }]);
		expect(await pullSettingsBlob(nuvio, 1)).toEqual({
			ui: { accent: "rose" },
		});
	});

	it("returns {} when there is no blob or the pull fails", async () => {
		expect(await pullSettingsBlob(nuvioWith([]), 1)).toEqual({});
		expect(await pullSettingsBlob(nuvioWith(new Error("x")), 1)).toEqual({});
	});
});

describe("pullShellSettings", () => {
	let account = 0;
	// A fresh account per test: the cache is process-wide.
	const owner = () => `account-${++account}`;

	/** Answers `web` and `mobile` pulls with their own blob, or an error. */
	function nuvioByPlatform(blobs: Record<string, unknown>) {
		const pull = vi.fn(async ({ p_platform }: { p_platform: string }) => {
			const blob = blobs[p_platform];
			if (blob instanceof Error) {
				throw blob;
			}
			return blob === undefined ? [] : [{ settings_json: blob }];
		});
		return { nuvio: { settings: { pull } } as unknown as NuvioClient, pull };
	}

	afterEach(() => {
		vi.useRealTimers();
	});

	it("parses the web ui block and the mobile app's audio languages", async () => {
		const { nuvio } = nuvioByPlatform({
			web: { ui: { accent: "green", watchRegion: "ZZ" } },
			mobile: {
				features: {
					player_settings: {
						preferred_audio_language: " fr ",
						secondary_preferred_audio_language: "",
					},
				},
			},
		});
		const { ui, appAudio } = await pullShellSettings(nuvio, owner(), 1);
		expect(ui.accent).toBe("green");
		expect(ui.watchRegion).toBe("auto");
		expect(ui.mode).toBe(DEFAULT_UI_SETTINGS.mode);
		expect(appAudio).toEqual({ preferred: "fr", secondary: null });
	});

	it("pulls once per account and profile until it expires", async () => {
		vi.useFakeTimers();
		const { nuvio, pull } = nuvioByPlatform({});
		const account = owner();
		await Promise.allSettled([
			pullShellSettings(nuvio, account, 1),
			pullShellSettings(nuvio, account, 1),
		]);
		expect(pull).toHaveBeenCalledTimes(2);
		await pullShellSettings(nuvio, account, 2);
		await pullShellSettings(nuvio, owner(), 1);
		expect(pull).toHaveBeenCalledTimes(6);
		vi.advanceTimersByTime(5 * 60_000);
		await pullShellSettings(nuvio, account, 1);
		expect(pull).toHaveBeenCalledTimes(8);
	});

	it("falls back to defaults on a failed pull and doesn't keep them", async () => {
		const { nuvio, pull } = nuvioByPlatform({
			web: new Error("down"),
			mobile: new Error("down"),
		});
		const account = owner();
		expect(await pullShellSettings(nuvio, account, 1)).toEqual({
			ui: DEFAULT_UI_SETTINGS,
			appAudio: { preferred: null, secondary: null },
		});
		await pullShellSettings(nuvio, account, 1);
		expect(pull).toHaveBeenCalledTimes(4);
	});

	it("pulls again once forgotten", async () => {
		const { nuvio, pull } = nuvioByPlatform({});
		const account = owner();
		await pullShellSettings(nuvio, account, 1);
		forgetShellSettings(account, 1);
		await pullShellSettings(nuvio, account, 1);
		expect(pull).toHaveBeenCalledTimes(4);
	});
});
