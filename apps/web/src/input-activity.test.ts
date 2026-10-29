import { afterEach, expect, it, vi } from "vitest";
import { InputActivity } from "./input-activity";
import { AFK_AFTER_MS } from "../../../packages/shared/protocol";

afterEach(() => vi.useRealTimers());
it("reports the last real input without constant traffic, including trailing activity", () => {
  vi.useFakeTimers();
  const send = vi.fn();
  const tracker = new InputActivity(send);
  tracker.input();
  expect(send).toHaveBeenLastCalledWith(0);
  vi.advanceTimersByTime(4000);
  tracker.input();
  expect(send).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(1000);
  expect(send).toHaveBeenLastCalledWith(1000);
  vi.advanceTimersByTime(AFK_AFTER_MS);
  expect(send).toHaveBeenCalledTimes(2);
  tracker.input();
  expect(send).toHaveBeenLastCalledWith(0);
  tracker.dispose();
});
it("retains idle age on reconnect and cancels pending work on cleanup", () => {
  vi.useFakeTimers();
  const send = vi.fn();
  const tracker = new InputActivity(send);
  vi.advanceTimersByTime(AFK_AFTER_MS + 1000);
  tracker.flush();
  expect(send).toHaveBeenCalledWith(AFK_AFTER_MS);
  tracker.input();
  expect(send).toHaveBeenLastCalledWith(0);
  expect(send).toHaveBeenCalledTimes(2);
  tracker.input();
  tracker.dispose();
  vi.advanceTimersByTime(5000);
  expect(send).toHaveBeenCalledTimes(2);
});
