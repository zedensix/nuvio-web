import { describe, expect, it, vi } from "vitest";
import { MemoryCache } from "./cache.service.ts";
import { forget, readThrough, remember } from "./read-through.ts";

describe("readThrough", () => {
	it("produces once, then answers from the cache", async () => {
		const cache = new MemoryCache();
		const produce = vi.fn(async () => ({ value: { n: 1 }, keep: true }));
		expect(await readThrough(cache, "a", 60_000, produce)).toEqual({ n: 1 });
		expect(await readThrough(cache, "a", 60_000, produce)).toEqual({ n: 1 });
		expect(produce).toHaveBeenCalledTimes(1);
	});

	it("keeps a null answer, not a fallback, nor a rejection", async () => {
		const cache = new MemoryCache();
		await readThrough(cache, "null", 60_000, async () => ({
			value: null,
			keep: true,
		}));
		expect(await cache.get("null")).toBeNull();

		await readThrough(cache, "fallback", 60_000, async () => ({
			value: [],
			keep: false,
		}));
		expect(await cache.get("fallback")).toBeUndefined();

		await expect(
			readThrough(cache, "boom", 60_000, () => Promise.reject(new Error("x"))),
		).rejects.toThrow("x");
		expect(await cache.get("boom")).toBeUndefined();
	});

	it("skips the cache without a key", async () => {
		const cache = new MemoryCache();
		const get = vi.spyOn(cache, "get");
		const produce = vi.fn(async () => ({ value: 1, keep: true }));
		await readThrough(cache, null, 60_000, produce);
		await readThrough(cache, null, 60_000, produce);
		expect(produce).toHaveBeenCalledTimes(2);
		expect(get).not.toHaveBeenCalled();
	});

	it("doesn't keep a read a forget overtook", async () => {
		const cache = new MemoryCache();
		let release: () => void = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const produce = vi.fn(async () => {
			await gate;
			return { value: "old", keep: true };
		});
		const stale = readThrough(cache, "k", 60_000, produce);
		await vi.waitFor(() => expect(produce).toHaveBeenCalled());
		await forget(cache, "k");
		release();
		expect(await stale).toBe("old");
		expect(await cache.get("k")).toBeUndefined();
	});
});

describe("remember", () => {
	it("answers the new value, even over a read that started before it", async () => {
		const cache = new MemoryCache();
		let release: () => void = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const produce = vi.fn(async () => {
			await gate;
			return { value: "old", keep: true };
		});
		const stale = readThrough(cache, "k", 60_000, produce);
		await vi.waitFor(() => expect(produce).toHaveBeenCalled());
		await remember(cache, "k", "new", 60_000);
		release();
		await stale;
		expect(await cache.get("k")).toBe("new");
	});
});
