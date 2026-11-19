import type { RedisClient } from "bun";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryCache, RedisCache } from "./cache.service.ts";

describe("MemoryCache", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("answers until the entry expires", async () => {
		vi.useFakeTimers();
		const cache = new MemoryCache();
		await cache.set("a", { n: 1 }, 1000);
		expect(await cache.get("a")).toEqual({ n: 1 });
		vi.advanceTimersByTime(1000);
		expect(await cache.get("a")).toBeUndefined();
	});

	it("hands out copies, never the stored object", async () => {
		const cache = new MemoryCache();
		const value = { list: [1] };
		await cache.set("a", value, 1000);
		value.list.push(2);
		const first = await cache.get<{ list: number[] }>("a");
		first?.list.push(3);
		expect(await cache.get("a")).toEqual({ list: [1] });
	});

	it("drops the oldest write past its size, and on delete", async () => {
		const cache = new MemoryCache(2);
		await cache.set("a", 1, 1000);
		await cache.set("b", 2, 1000);
		await cache.set("a", 3, 1000);
		await cache.set("c", 4, 1000);
		expect(await cache.get("b")).toBeUndefined();
		expect(await cache.get("a")).toBe(3);
		await cache.delete("a");
		expect(await cache.get("a")).toBeUndefined();
		expect(await cache.get("c")).toBe(4);
	});
});

describe("RedisCache", () => {
	function fakeRedis(
		over: Partial<Record<"get" | "set" | "del" | "connect", unknown>> = {},
	) {
		const store = new Map<string, string>();
		const client = {
			get: vi.fn(async (key: string) => store.get(key) ?? null),
			set: vi.fn(async (key: string, value: string) => {
				store.set(key, value);
				return "OK";
			}),
			del: vi.fn(async (key: string) => Number(store.delete(key))),
			close: vi.fn(),
			connect: vi.fn(async () => undefined),
			...over,
		};
		return { client, store };
	}

	it("stores JSON under the app's prefix, with a millisecond expiry", async () => {
		const { client, store } = fakeRedis();
		const cache = new RedisCache(
			"redis://x",
			{ warn: vi.fn() },
			client as unknown as RedisClient,
		);
		await cache.set("a", { n: 1 }, 1500.4);
		expect(client.set).toHaveBeenCalledWith("nuvio:a", '{"n":1}', "PX", 1500);
		expect(store.has("nuvio:a")).toBe(true);
		expect(await cache.get("a")).toEqual({ n: 1 });
		await cache.delete("a");
		expect(await cache.get("a")).toBeUndefined();
		cache.dispose();
		expect(client.close).toHaveBeenCalled();
	});

	it("misses instead of failing while Redis is down, and warns once", async () => {
		const down = async () => {
			throw new Error("Connection closed");
		};
		const { client } = fakeRedis({
			get: down,
			set: down,
			del: down,
			connect: down,
		});
		const warn = vi.fn();
		const cache = new RedisCache(
			"redis://x",
			{ warn },
			client as unknown as RedisClient,
		);
		expect(await cache.get("a")).toBeUndefined();
		await cache.set("a", 1, 1000);
		await cache.delete("a");
		expect(warn).toHaveBeenCalledTimes(1);
	});
});
