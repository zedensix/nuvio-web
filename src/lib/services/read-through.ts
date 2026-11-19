import type { Cache } from "./cache.service.ts";

/**
 * Bumped by `forget`, so a read that started before it can't put the old
 * value back once it lands. One process owns the writes, so this stays in
 * memory even when the cache is Redis.
 */
const generations = new Map<string, number>();

/**
 * `key` from the cache, else what `produce` answers. That answer is kept for
 * `ttlMs` when `produce` says it may be (a fallback after a failed pull isn't)
 * and no `forget(key)` ran in the meantime. A rejection isn't kept either. A
 * `null` key (no session to own the entry) skips the cache.
 */
export async function readThrough<T>(
	cache: Cache,
	key: string | null,
	ttlMs: number,
	produce: () => Promise<{ value: T; keep: boolean }>,
): Promise<T> {
	if (key === null) {
		return (await produce()).value;
	}
	const hit = await cache.get<T>(key);
	if (hit !== undefined) {
		return hit;
	}
	const generation = generations.get(key) ?? 0;
	const { value, keep } = await produce();
	if (keep && (generations.get(key) ?? 0) === generation) {
		await cache.set(key, value, ttlMs);
	}
	return value;
}

function bump(key: string): void {
	generations.set(key, (generations.get(key) ?? 0) + 1);
}

/** Drops `key` after a write, so the next read fetches the new value. */
export async function forget(cache: Cache, key: string): Promise<void> {
	bump(key);
	await cache.delete(key);
}

/**
 * Puts a value being written in place of `key`'s, for a write the page doesn't
 * wait on: a read that lands before the write does still gets the new value.
 */
export async function remember(
	cache: Cache,
	key: string,
	value: unknown,
	ttlMs: number,
): Promise<void> {
	bump(key);
	await cache.set(key, value, ttlMs);
}
