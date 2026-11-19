import { RedisClient } from "bun";
import type { Logger } from "./logger.service.ts";

/**
 * A key → JSON value store with an expiry, shared by the whole server. In
 * memory by default; in Redis when `NUVIO_REDIS_URL` is set, so it outlives a
 * restart or a deploy. Never the source of truth: a miss, an outage or a
 * flush only costs a refetch, so every call answers instead of throwing.
 *
 * Values go through JSON on both backends, so a caller never gets a shared
 * object it could mutate under another request.
 */
export interface Cache {
	get: <T>(key: string) => Promise<T | undefined>;
	set: (key: string, value: unknown, ttlMs: number) => Promise<void>;
	delete: (key: string) => Promise<void>;
}

/** Past this many entries the oldest written goes first. */
const MEMORY_MAX_ENTRIES = 5000;

export class MemoryCache implements Cache {
	readonly #entries = new Map<string, { json: string; expiresAt: number }>();

	constructor(private readonly maxEntries = MEMORY_MAX_ENTRIES) {}

	get<T>(key: string): Promise<T | undefined> {
		const entry = this.#entries.get(key);
		if (entry && entry.expiresAt <= Date.now()) {
			this.#entries.delete(key);
		} else if (entry) {
			return Promise.resolve(JSON.parse(entry.json) as T);
		}
		return Promise.resolve(undefined);
	}

	set(key: string, value: unknown, ttlMs: number): Promise<void> {
		this.#entries.delete(key);
		this.#entries.set(key, {
			json: JSON.stringify(value),
			expiresAt: Date.now() + ttlMs,
		});
		for (const oldest of this.#entries.keys()) {
			if (this.#entries.size <= this.maxEntries) {
				break;
			}
			this.#entries.delete(oldest);
		}
		return Promise.resolve();
	}

	delete(key: string): Promise<void> {
		this.#entries.delete(key);
		return Promise.resolve();
	}
}

/** Keys live under this, so a Redis shared with other apps stays readable. */
const KEY_PREFIX = "nuvio:";
/** One warning per outage, not one per request. */
const WARN_EVERY_MS = 60_000;

export class RedisCache implements Cache {
	readonly #client: RedisClient;
	/** The first connection: calls wait on it, later reconnects they don't. */
	readonly #connected: Promise<void>;
	#warnedAt = 0;

	constructor(
		url: string,
		private readonly logger: Pick<Logger, "warn">,
		client?: RedisClient,
	) {
		// No offline queue: while Redis is down a call fails at once (a miss)
		// instead of waiting for a reconnect that may never come. So the first
		// connection is awaited explicitly, or the first command would fail.
		this.#client =
			client ??
			new RedisClient(url, {
				enableOfflineQueue: false,
				connectionTimeout: 2000,
			});
		this.#connected = this.#client
			.connect()
			.catch((error: unknown) => this.#warn(error));
	}

	async get<T>(key: string): Promise<T | undefined> {
		await this.#connected;
		try {
			const json = await this.#client.get(KEY_PREFIX + key);
			return json === null ? undefined : (JSON.parse(json) as T);
		} catch (error) {
			this.#warn(error);
			return undefined;
		}
	}

	async set(key: string, value: unknown, ttlMs: number): Promise<void> {
		await this.#connected;
		try {
			await this.#client.set(
				KEY_PREFIX + key,
				JSON.stringify(value),
				"PX",
				Math.max(1, Math.round(ttlMs)),
			);
		} catch (error) {
			this.#warn(error);
		}
	}

	async delete(key: string): Promise<void> {
		await this.#connected;
		try {
			await this.#client.del(KEY_PREFIX + key);
		} catch (error) {
			this.#warn(error);
		}
	}

	dispose(): void {
		this.#client.close();
	}

	#warn(error: unknown): void {
		const now = Date.now();
		if (now - this.#warnedAt < WARN_EVERY_MS) {
			return;
		}
		this.#warnedAt = now;
		this.logger.warn("Redis cache unavailable, serving without it", {
			error: String(error),
		});
	}
}
