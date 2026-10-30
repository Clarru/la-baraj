import { it, expect, vi } from "vitest";
import { createArcadeResourceLifetime } from "./arcade2048-resources";
it("keeps GPU resources live across StrictMode cleanup/setup and releases once on final unmount", async () => {
  const dispose = vi.fn(),
    retain = createArcadeResourceLifetime(dispose),
    first = retain();
  first();
  const replay = retain();
  await Promise.resolve();
  expect(dispose).not.toHaveBeenCalled();
  replay();
  await Promise.resolve();
  expect(dispose).toHaveBeenCalledOnce();
  replay();
  await Promise.resolve();
  expect(dispose).toHaveBeenCalledOnce();
});
it("disposes a replaced resource even when another instance is retained", async () => {
  const oldDispose = vi.fn(),
    newDispose = vi.fn(),
    old = createArcadeResourceLifetime(oldDispose),
    next = createArcadeResourceLifetime(newDispose);
  const release = old();
  release();
  const newRelease = next();
  await Promise.resolve();
  expect(oldDispose).toHaveBeenCalledOnce();
  expect(newDispose).not.toHaveBeenCalled();
  newRelease();
  await Promise.resolve();
  expect(newDispose).toHaveBeenCalledOnce();
});
