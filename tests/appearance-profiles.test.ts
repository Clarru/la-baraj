import { describe, expect, it, vi } from "vitest";
import { AppearanceProfiles } from "../apps/server/appearance-profiles";
import { DEFAULT_APPEARANCE } from "../packages/shared/appearance";

describe("owner appearance persistence", () => {
  it("persists hat dye through profile reload while defaulting legacy profiles", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const profiles = new AppearanceProfiles({ save });
    const dyed = {
      ...DEFAULT_APPEARANCE,
      hat: "knit-beanie" as const,
      hatColor: "rust" as const,
    };
    await profiles.save(0, dyed);
    expect(save).toHaveBeenCalledWith(0, dyed);
    const restored = new AppearanceProfiles({ save }, [
      [0, save.mock.calls[0][1]],
      [1, { version: 1, body: "male", hat: "panel-cap" }],
    ]);
    expect(restored.get(0)).toEqual(dyed);
    expect(restored.get(1)).toMatchObject({
      hat: "panel-cap",
      hatColor: "original",
    });
  });
  it("restores profiles without changing old owners or accepting arbitrary fields", () => {
    const profiles = new AppearanceProfiles({ save: async () => {} }, [
      [0, { version: 1, body: "female", url: "/arbitrary.glb" }],
      [1, { ...DEFAULT_APPEARANCE, hair: "buzzed" }],
      [90, { version: 1, body: "female" }],
    ]);
    expect(profiles.get(0)).toEqual({ version: 1, body: "female" });
    expect(profiles.get(1)).toEqual({ ...DEFAULT_APPEARANCE, hair: "buzzed" });
    expect(profiles.get(2)).toEqual(DEFAULT_APPEARANCE);
    expect(profiles.get(90)).toEqual(DEFAULT_APPEARANCE);
  });

  it("keeps the committed profile on storage failure and supports a later retry", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(Error("storage unavailable"))
      .mockResolvedValue(undefined);
    const profiles = new AppearanceProfiles({ save });
    await expect(
      profiles.save(0, { version: 1, body: "female" }),
    ).rejects.toThrow("storage unavailable");
    expect(profiles.get(0)).toEqual(DEFAULT_APPEARANCE);
    await profiles.save(0, { version: 1, body: "female" });
    expect(profiles.get(0)).toEqual({ version: 1, body: "female" });
  });

  it("commits the latest receipt in order for one owner", async () => {
    let release!: () => void;
    const first = new Promise<void>((resolve) => {
      release = resolve;
    });
    const save = vi
      .fn()
      .mockImplementationOnce(() => first)
      .mockResolvedValue(undefined);
    const profiles = new AppearanceProfiles({ save });
    const old = profiles.save(0, { version: 1, body: "female" });
    const recent = profiles.save(0, {
      ...DEFAULT_APPEARANCE,
      top: "weekend-knit",
    });
    await Promise.resolve();
    expect(save).toHaveBeenCalledTimes(1);
    expect(profiles.get(0)).toEqual(DEFAULT_APPEARANCE);
    release();
    await Promise.all([old, recent]);
    expect(profiles.get(0)).toEqual({
      ...DEFAULT_APPEARANCE,
      top: "weekend-knit",
    });
  });

  it("copies inputs and returned preferences, and bounds owner indexes", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const profiles = new AppearanceProfiles({ save });
    const input = { ...DEFAULT_APPEARANCE };
    const pending = profiles.save(0, input);
    input.hair = "long";
    await pending;
    expect(profiles.get(0)).toEqual(DEFAULT_APPEARANCE);
    const returned = profiles.get(0);
    if (returned.body === "male") returned.hair = "buzzed";
    expect(profiles.get(0)).toEqual(DEFAULT_APPEARANCE);
    await expect(profiles.save(-1, input)).rejects.toThrow(RangeError);
    await expect(profiles.save(50, input)).rejects.toThrow(RangeError);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("queues a revert behind an in-flight change even if it matches the old committed value", async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const save = vi
      .fn()
      .mockImplementationOnce(() => blocked)
      .mockResolvedValue(undefined);
    const profiles = new AppearanceProfiles({ save }, [
      [0, DEFAULT_APPEARANCE],
    ]);
    const first = profiles.save(0, { version: 1, body: "female" });
    const revert = profiles.save(0, DEFAULT_APPEARANCE);
    await Promise.resolve();
    release();
    await Promise.all([first, revert]);
    expect(save).toHaveBeenCalledTimes(2);
    expect(profiles.get(0)).toEqual(DEFAULT_APPEARANCE);
  });
});
