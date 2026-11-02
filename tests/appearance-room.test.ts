import { describe, expect, it, vi } from "vitest";
import { AppearanceProfiles } from "../apps/server/appearance-profiles";
import { HomeAssignments } from "../apps/server/home-assignments";
import {
  RoomCore,
  type RoomConnection,
  type SessionState,
} from "../apps/server/room-core";
import { DEFAULT_APPEARANCE } from "../packages/shared/appearance";
import {
  HOUSING_EPOCH,
  parseClientMessage,
  type ServerMessage,
} from "../packages/shared/protocol";

function fixture(appearanceEnabled = true) {
  const connections: RoomConnection[] = [];
  const save = vi.fn().mockResolvedValue(undefined);
  const profiles = new AppearanceProfiles({ save });
  const ledger = {
    version: 2 as const,
    owners: [0, 1].map((index) => ({
      digest: String(index + 1).repeat(64),
      index,
      ownerName: "Owner " + index,
      pendingName: "Owner " + index,
      nameSince: 0,
    })),
  };
  const homes = new HomeAssignments(
    {
      save: async () => {},
      digest: async (token) =>
        token === "a".repeat(43) ? "1".repeat(64) : "2".repeat(64),
    },
    ledger,
  );
  const room = new RoomCore({
    connections: () => connections,
    saveFire: async () => {},
    homes,
    ...(appearanceEnabled ? { appearances: profiles } : {}),
  });
  function connect(id: string) {
    const messages: ServerMessage[] = [];
    const c = {
      state: null as SessionState | null,
      setState(next: SessionState) {
        this.state = structuredClone(next);
      },
      send(raw: string) {
        messages.push(JSON.parse(raw));
      },
      close: vi.fn(),
      messages,
    };
    connections.push(c);
    room.connect(c, id, 1000);
    return c;
  }
  async function hello(c: RoomConnection, index = 0) {
    await room.message(
      c,
      JSON.stringify({
        type: "hello",
        nickname: "Owner " + index,
        requestHome: true,
        resumeToken: (index === 0 ? "a" : "b").repeat(43),
        housingEpoch: HOUSING_EPOCH,
      }),
      1100,
    );
  }
  return { room, connect, hello, profiles, save };
}

describe("room appearance authority and compatibility", () => {
  it("advertises hat colours only when appearance profiles are available", async () => {
    for (const enabled of [true, false]) {
      const f = fixture(enabled),
        owner = f.connect("owner");
      await f.hello(owner);
      const snapshot = owner.messages.find(
        (message) => message.type === "snapshot",
      );
      expect(snapshot?.features?.appearanceHatColors).toBe(
        enabled ? true : undefined,
      );
    }
  });
  it("keeps old hellos valid and strips arbitrary cosmetic paths", () => {
    expect(
      parseClientMessage(
        JSON.stringify({ type: "hello", nickname: "Old client" }),
      ),
    ).toEqual({ type: "hello", nickname: "Old client" });
    expect(
      parseClientMessage(
        JSON.stringify({
          type: "appearance",
          requestId: "a",
          appearance: {
            ...DEFAULT_APPEARANCE,
            top: "https://example.test/model.glb",
            owner: 12,
          },
        }),
      ),
    ).toEqual({
      type: "appearance",
      requestId: "a",
      appearance: DEFAULT_APPEARANCE,
    });
  });

  it("rejects changing an unclaimed owner's profile", async () => {
    const f = fixture(),
      guest = f.connect("guest");
    await f.room.message(
      guest,
      JSON.stringify({
        type: "appearance",
        requestId: "before-home",
        appearance: { version: 1, body: "female" },
      }),
      1100,
    );
    expect(f.save).not.toHaveBeenCalled();
    expect(guest.messages.at(-1)).toMatchObject({
      type: "appearance",
      requestId: "before-home",
      error: expect.any(String),
    });
    expect(guest.close).not.toHaveBeenCalled();
  });

  it("saves only the authenticated home, broadcasts once and retains cosmetics across pose traffic", async () => {
    const f = fixture(),
      owner = f.connect("owner"),
      observer = f.connect("observer");
    await f.hello(owner, 0);
    await f.hello(observer, 1);
    await f.room.message(
      owner,
      JSON.stringify({
        type: "appearance",
        requestId: "apply",
        appearance: { version: 1, body: "female" },
      }),
      2000,
    );
    expect(f.profiles.get(0)).toEqual({ version: 1, body: "female" });
    expect(f.profiles.get(1)).toEqual(DEFAULT_APPEARANCE);
    expect(owner.messages.at(-1)).toMatchObject({
      type: "appearance",
      id: "owner",
      requestId: "apply",
      appearance: { body: "female" },
    });
    expect(observer.messages.at(-1)).toMatchObject({
      type: "appearance",
      id: "owner",
      appearance: { body: "female" },
    });
    await f.room.message(
      owner,
      JSON.stringify({
        type: "pose",
        pose: {
          position: [0, 0, 0],
          yaw: 0,
          animation: "Walk",
          activity: "none",
          vehicle: "none",
        },
      }),
      2100,
    );
    expect(observer.messages.at(-1)).toMatchObject({ type: "pose" });
    expect(
      (observer.messages.at(-1) as { player: unknown }).player,
    ).not.toHaveProperty("appearance");
    f.room.snapshot(observer, 2200);
    const snapshot = observer.messages.at(-1);
    expect(snapshot?.type).toBe("snapshot");
    if (snapshot?.type === "snapshot") {
      expect(snapshot.features?.appearance).toBe(true);
      expect(
        snapshot.players.find((p) => p.id === "owner")?.appearance,
      ).toEqual({ version: 1, body: "female" });
    }
  });

  it("restores a saved owner's profile on reconnect and leaves home ownership untouched", async () => {
    const f = fixture(),
      first = f.connect("first");
    await f.hello(first, 0);
    await f.room.message(
      first,
      JSON.stringify({
        type: "appearance",
        requestId: "save",
        appearance: { version: 1, body: "female" },
      }),
      2000,
    );
    const reconnect = f.connect("reconnect");
    await f.hello(reconnect, 0);
    expect(reconnect.state?.home?.index).toBe(0);
    expect(reconnect.state?.appearance).toEqual({ version: 1, body: "female" });
    const stale = f.connect("stale-device");
    await f.room.message(
      stale,
      JSON.stringify({
        type: "hello",
        nickname: "Owner 0",
        requestHome: true,
        resumeToken: "a".repeat(43),
        housingEpoch: HOUSING_EPOCH,
        appearance: DEFAULT_APPEARANCE,
      }),
      2300,
    );
    expect(stale.state?.appearance).toEqual({ version: 1, body: "female" });
    expect(f.profiles.get(0)).toEqual({ version: 1, body: "female" });
  });

  it("keeps the prior visible profile when storage fails and acknowledges the failed request", async () => {
    const f = fixture(),
      owner = f.connect("owner");
    await f.hello(owner, 0);
    f.save.mockRejectedValueOnce(Error("disk"));
    await f.room.message(
      owner,
      JSON.stringify({
        type: "appearance",
        requestId: "failed",
        appearance: { version: 1, body: "female" },
      }),
      2000,
    );
    expect(owner.state?.appearance).toEqual(DEFAULT_APPEARANCE);
    expect(owner.messages.at(-1)).toMatchObject({
      type: "appearance",
      requestId: "failed",
      error: expect.any(String),
    });
    expect(owner.close).not.toHaveBeenCalled();
  });
});
