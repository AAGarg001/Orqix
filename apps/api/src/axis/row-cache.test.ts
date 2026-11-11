import {describe,it,expect,vi,afterEach} from "vitest";
import {PublishedRowCache} from "./row-cache.js";
import type {AxisRow} from "./parser.js";
afterEach(()=>vi.useRealTimers());
describe("ephemeral published row cache",()=>{
 it("coalesces concurrent reads and expires rows",async()=>{
  vi.useFakeTimers();const cache=new PublishedRowCache(30);const load=vi.fn(async()=>[{quantity:1}] as AxisRow[]);
  await Promise.all([cache.read("a",load),cache.read("a",load)]);expect(load).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(31);await cache.read("a",load);expect(load).toHaveBeenCalledTimes(2);
 });
 it("isolates IDs, bounds entries and invalidates revoked content",async()=>{
  const cache=new PublishedRowCache(30000,3,1);const a=vi.fn(async()=>[{quantity:1}] as AxisRow[]);const b=vi.fn(async()=>[{quantity:2}] as AxisRow[]);
  await cache.read("tenant-a:dataset",a);expect((await cache.read("tenant-b:dataset",b))[0].quantity).toBe(2);
  await cache.read("tenant-a:dataset",a);expect(a).toHaveBeenCalledTimes(2);cache.invalidate("tenant-a:dataset");await cache.read("tenant-a:dataset",a);expect(a).toHaveBeenCalledTimes(3);
 });
 it("does not retain failures or revive invalidated pending reads",async()=>{
  const cache=new PublishedRowCache();let finish!:(r:AxisRow[])=>void;
  const pending=cache.read("a",()=>new Promise(resolve=>{finish=resolve;}));cache.invalidate("a");finish([]);await pending;
  const load=vi.fn(async()=>[]);await cache.read("a",load);expect(load).toHaveBeenCalledOnce();
  await expect(cache.read("b",async()=>{throw Error("unavailable")})).rejects.toThrow();await expect(cache.read("b",async()=>[])).resolves.toEqual([]);
 });
});
