import * as v from "valibot";
import type { NuvioClient } from "#lib/nuvio/index.js";
import {
	EMPTY_HOME_LAYOUT,
	type HomeLayout,
	parseHomeLayout,
} from "./home-layout.ts";
import { PLATFORM, type UiSettings, uiSettingsSchema } from "./ui-settings.ts";

type Blob = Record<string, unknown>;

async function pullBlob(
	nuvio: NuvioClient,
	profileId: number,
	platform: string,
): Promise<Blob> {
	const blobs = await nuvio.settings.pull({
		p_profile_id: profileId,
		p_platform: platform,
	});
	return (blobs[0]?.settings_json ?? {}) as Blob;
}

/** The raw `web` settings blob for a profile, or `{}` on any failure. */
export function pullSettingsBlob(
	nuvio: NuvioClient,
	profileId: number,
): Promise<Blob> {
	return pullBlob(nuvio, profileId, PLATFORM).catch(() => ({}));
}

/** The Nuvio mobile app's namespace in the profile settings store. */
const MOBILE_PLATFORM = "mobile";

/** The audio languages set in the Nuvio mobile app, as it stores them. */
export interface AppAudioLanguage {
	preferred: string | null;
	secondary: string | null;
}

/**
 * Read-only : the mobile app owns that blob and replaces it whole, so this
 * client never writes there. Nulls when the app was never used or on any failure.
 */
function appAudioLanguage(blob: Blob): AppAudioLanguage {
	const features = blob.features as Blob | undefined;
	const player = (features?.player_settings ?? {}) as Blob;
	const text = (value: unknown) =>
		typeof value === "string" && value.trim() ? value.trim() : null;
	return {
		preferred: text(player.preferred_audio_language),
		secondary: text(player.secondary_preferred_audio_language),
	};
}

function uiSettings(blob: Blob): UiSettings {
	return v.parse(uiSettingsSchema, blob.ui ?? {});
}

/** What the `(app)` layout needs before it can ship any page. */
export interface ShellSettings {
	ui: UiSettings;
	appAudio: AppAudioLanguage;
}

const SHELL_TTL_MS = 5 * 60_000;

/**
 * Process-wide, keyed `<accountKey>:<profileId>` (a profile index alone is
 * shared by every account). Holds the promise, so concurrent loads share one
 * pull and `forgetShellSettings` can't be undone by a pull already in flight.
 */
const shellCache = new Map<
	string,
	{ at: number; settings: Promise<ShellSettings> }
>();

/**
 * The layout's two settings pulls, cached for a few minutes: they gate every
 * full page load, and both blobs change rarely. Only a fully successful pull
 * is kept, so a Nuvio hiccup doesn't pin the defaults. A change made in the
 * mobile app shows up once the entry expires; one made here clears it.
 */
export function pullShellSettings(
	nuvio: NuvioClient,
	accountKey: string,
	profileId: number,
): Promise<ShellSettings> {
	const now = Date.now();
	for (const [key, entry] of shellCache) {
		if (now - entry.at >= SHELL_TTL_MS) {
			shellCache.delete(key);
		}
	}
	const key = `${accountKey}:${profileId}`;
	const hit = shellCache.get(key);
	if (hit) {
		return hit.settings;
	}
	const settings = Promise.allSettled([
		pullBlob(nuvio, profileId, PLATFORM),
		pullBlob(nuvio, profileId, MOBILE_PLATFORM),
	]).then(([web, mobile]) => {
		if (
			(web.status === "rejected" || mobile.status === "rejected") &&
			shellCache.get(key)?.settings === settings
		) {
			shellCache.delete(key);
		}
		return {
			ui: uiSettings(web.status === "fulfilled" ? web.value : {}),
			appAudio: appAudioLanguage(
				mobile.status === "fulfilled" ? mobile.value : {},
			),
		};
	});
	shellCache.set(key, { at: now, settings });
	return settings;
}

/** Drops a profile's cached shell settings : after this app writes them. */
export function forgetShellSettings(
	accountKey: string,
	profileId: number,
): void {
	shellCache.delete(`${accountKey}:${profileId}`);
}

/** This profile's home layout for the web client, or the empty one on any failure. */
export async function pullHomeLayout(
	nuvio: NuvioClient,
	profileId: number,
): Promise<HomeLayout> {
	const rows = await nuvio.homeCatalog
		.pull({ p_profile_id: profileId, p_platform: PLATFORM })
		.catch(() => []);
	return rows[0] ? parseHomeLayout(rows[0].settings_json) : EMPTY_HOME_LAYOUT;
}
