import { useEffect, useMemo, useRef, useState } from "react";
import "@fontsource/barlow/latin-400.css";
import "@fontsource/barlow/latin-500.css";
import "@fontsource/barlow/latin-600.css";
import {
  DialRoot,
  DialTimeline,
  useDialKitController,
  useDialTimeline,
  type DialConfig,
} from "dialkit";
import {
  SlidersHorizontal,
  X,
  ClockCounterClockwise,
} from "@phosphor-icons/react";
import {
  formatClockMinutes,
  gameMinutes,
  lightingAt,
  worldNow,
} from "./day-night";
import {
  environmentDefaults as defaults,
  setEnvironmentTuning,
  setEnvironmentTimelineHour,
  weatherLooks,
} from "./environment-tuning";
import {
  phaseHour,
  syncProfileHour,
  profileId,
  readProfileSelection,
  rememberProfile,
  exportProfiles,
  timeProfiles,
  weatherProfiles,
  type ProfileSelection,
} from "./environment-profiles";
import { solarDay, solarPosition, solarPaletteHour } from "./solar";
import "dialkit/styles.css";
import "./environment-lab.css";

const config = {
  enabled: false as boolean,
  clock: {
    liveTime: true as boolean,
    hour: [12, 0, 23.99, 0.01],
  },
  weather: {
    liveWeather: true as boolean,
    cloudCover: [0, 0, 1, 0.01],
  },
  light: {
    _collapsed: true,
    sun: [1, 0, 3, 0.01],
    hemisphere: [1, 0, 3, 0.01],
    ambient: [1, 0, 3, 0.01],
    exposure: [0.92, 0.1, 2.5, 0.01],
    shadows: true as boolean,
    manualSun: false as boolean,
    sunPosition: {
      type: "pad",
      x: [-137, -180, 180, 1],
      y: [49, 2, 90, 1],
      labels: { x: "Azimuth °", y: "Elevation °" },
    },
    ground: defaults.light.ground,
  },
  atmosphere: {
    _collapsed: true,
    fogNear: [480, 0, 1500, 5],
    fogFar: [3300, 50, 5000, 10],
    cloudScale: [1, 0.2, 4, 0.01],
    cloudOpacity: [0.55, 0, 1, 0.01],
    wind: {
      type: "pad",
      x: [1, -8, 8, 0.1],
      y: [0, -8, 8, 0.1],
      labels: { x: "East / west", y: "North / south" },
    },
  },
  palette: {
    _collapsed: true,
    ...defaults.palette,
    sampleTime: { type: "action", label: "Sample this time’s colors" },
  },
  water: {
    _collapsed: true,
    waveSpeed: [0.45, 0, 2, 0.01],
    distortion: [0.65, 0, 5, 0.01],
    size: [7.5, 1, 20, 0.1],
  },
  reference: {
    _collapsed: true,
    image: { type: "image" },
    show: true as boolean,
    opacity: [0.75, 0.05, 1, 0.01],
    notes: {
      type: "text",
      default: "",
      placeholder: "What should this mood feel like?",
    },
  },
  exportSettings: { type: "action", label: "Export settings as JSON" },
  reset: { type: "action", label: "Reset this condition" },
} satisfies DialConfig;

function DayTimeline() {
  const timeline = useDialTimeline(
    "One day at the lake",
    {
      daylight: {
        at: 0,
        duration: 30,
        from: { hour: 0 },
        to: { hour: 24 },
        transition: { type: "easing", duration: 30, ease: [0, 0, 1, 1] },
      },
    },
    {
      id: "la-baraj-day-timeline-v1",
      persist: true,
      autoplay: false,
      loop: true,
    },
  );
  useEffect(() => {
    setEnvironmentTimelineHour(timeline.daylight.current.hour);
  }, [timeline.daylight.current.hour]);
  useEffect(() => () => setEnvironmentTimelineHour(null), []);
  return <DialTimeline productionEnabled theme="dark" />;
}

function ProfileEditor({
  onEditing,
  selection,
  onSelect,
  requested,
}: {
  onEditing: (active: boolean) => void;
  selection: ProfileSelection;
  onSelect: (next: ProfileSelection) => void;
  requested: number;
}) {
  const [open, setOpen] = useState(true);
  const [timeline, setTimeline] = useState(false);
  const [status, setStatus] = useState("");
  const actions = useRef<(path: string) => void>(() => {});
  const profileConfig = useMemo(() => {
    const look = weatherLooks[selection.weather],
      hour = phaseHour(selection.time, worldNow(), selection.month);
    const sun = solarPosition(hour, solarDay(worldNow(), selection.month));
    const next = structuredClone(config);
    next.clock.liveTime = false;
    next.clock.hour[0] = hour;
    next.weather.liveWeather = false;
    next.weather.cloudCover[0] = look.cloudCover;
    next.light.sun[0] = look.sun;
    next.light.sunPosition.x[0] = (Math.atan2(sun.x, sun.z) * 180) / Math.PI;
    next.light.sunPosition.y[0] = Math.max(2, sun.elevation);
    next.atmosphere.fogNear[0] = look.fogNear;
    next.atmosphere.fogFar[0] = look.fogFar;
    next.atmosphere.wind.x[0] = look.wind.x;
    next.atmosphere.wind.y[0] = look.wind.y;
    next.water.distortion[0] = look.distortion;
    return next;
  }, [selection.time, selection.weather]);
  const dial = useDialKitController(
    `${timeProfiles[selection.time]} · ${weatherProfiles[selection.weather]}`,
    profileConfig,
    {
      id: profileId(selection),
      persist: true,
      onAction: (path) => actions.current(path),
    },
  );
  const values = dial.values;
  useEffect(() => {
    if (requested) dial.setValue("enabled", true);
  }, [requested]);
  useEffect(() => {
    const current = dial.getValues();
    let storage: Storage | null = null;
    try {
      storage = localStorage;
    } catch {}
    const hour = syncProfileHour(
      storage,
      selection,
      current.clock.hour,
      worldNow(),
    );
    const sun = solarPosition(hour, solarDay(worldNow(), selection.month));
    dial.setValues({
      clock: { hour },
      ...(!current.light.manualSun
        ? {
            light: {
              sunPosition: {
                x: (Math.atan2(sun.x, sun.z) * 180) / Math.PI,
                y: Math.max(2, sun.elevation),
              },
            },
          }
        : {}),
    });
  }, [selection.time, selection.weather, selection.month, values.clock.hour]);
  actions.current = (path) => {
    if (path === "palette.sampleTime") {
      const light = lightingAt(
        solarPaletteHour(
          values.clock.liveTime
            ? gameMinutes(worldNow()) / 60
            : values.clock.hour,
          solarDay(worldNow(), selection.month),
        ),
      );
      dial.setValues({
        palette: {
          customColors: true,
          ...Object.fromEntries(
            Object.entries(light.colors).map(([key, color]) => [
              key,
              `#${color.getHexString()}`,
            ]),
          ),
        },
      });
    }
    if (path === "reset") {
      setTimeline(false);
      dial.resetValues();
      dial.setValues({
        enabled: true,
        clock: { hour: phaseHour(selection.time, worldNow(), selection.month) },
      });
      setStatus("This condition reset.");
    }
    if (path === "exportSettings") {
      let profiles: Record<string, unknown> = {},
        previousDraft: string | null = null;
      try {
        profiles = exportProfiles(localStorage);
        previousDraft = localStorage.getItem("dialkit:la-baraj-environment-v1");
      } catch {}
      const blob = new Blob(
        [
          JSON.stringify(
            {
              schema: 2,
              selection,
              current: dial.getValues(),
              profiles,
              previousDraft,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "la-baraj-lighting.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus("Lighting settings exported.");
    }
  };
  useEffect(() => {
    setEnvironmentTuning({
      ...values,
      clock: { ...values.clock, month: selection.month },
    });
  }, [values, selection.month]);
  useEffect(
    () => () => {
      setEnvironmentTuning(null);
      onEditing(false);
    },
    [onEditing],
  );
  // Keep native Dialkit keyboard behavior, but pause game actions while a control has focus.
  // This also covers the library's color/select portals and timeline dock.
  useEffect(() => {
    const editing = (target: EventTarget | null) =>
      target instanceof Element &&
      Boolean(
        target.closest(
          ".environment-lab, .dialkit-root, [data-dialkit-portal-root]",
        ),
      );
    const focus = () => onEditing(editing(document.activeElement));
    const pointer = (event: PointerEvent) =>
      onEditing(editing(event.target) || editing(document.activeElement));
    const key = (event: KeyboardEvent) => {
      if (editing(event.target)) event.stopPropagation();
    };
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", focus);
    document.addEventListener("pointerover", pointer);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", focus);
      document.removeEventListener("pointerover", pointer);
      document.removeEventListener("keydown", key);
    };
  }, [onEditing]);
  const restoreLive = () => {
    setTimeline(false);
    dial.setValues({ enabled: false });
    setStatus("Live Romanian time and shared weather restored.");
  };
  const selectCondition = (next: ProfileSelection) => {
    setTimeline(false);
    setStatus("");
    onSelect(next);
  };
  return (
    <>
      <div
        className="environment-lab-launcher environment-lab"
        data-dialkit-ignore
      >
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            onEditing(false);
          }}
          aria-expanded={open}
          aria-controls="environment-lab-panel"
        >
          <SlidersHorizontal size={18} /> Lighting
          {values.enabled && (
            <span
              className="environment-lab-dot"
              aria-label="Preview edits enabled"
            />
          )}
        </button>
      </div>
      {open && (
        <aside
          id="environment-lab-panel"
          className="environment-lab-panel environment-lab"
          aria-label="Lighting and weather controller"
          data-dialkit-ignore
        >
          <header>
            <div>
              <strong>Lighting</strong>
            </div>
            <button
              type="button"
              aria-label="Close lighting controller"
              onClick={() => {
                setOpen(false);
                onEditing(false);
              }}
            >
              <X size={18} />
            </button>
          </header>
          <div className="environment-lab-selectors">
            <label>
              Time
              <select
                aria-label="Time profile"
                value={selection.time}
                onChange={(e) =>
                  selectCondition({
                    ...selection,
                    time: e.target.value as ProfileSelection["time"],
                  })
                }
              >
                {Object.entries(timeProfiles).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Weather
              <select
                aria-label="Weather profile"
                value={selection.weather}
                onChange={(e) =>
                  selectCondition({
                    ...selection,
                    weather: e.target.value as ProfileSelection["weather"],
                  })
                }
              >
                {Object.entries(weatherProfiles).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Month
              <select
                aria-label="Preview month"
                value={selection.month}
                onChange={(e) =>
                  selectCondition({
                    ...selection,
                    month: Number(e.target.value),
                  })
                }
              >
                <option value={0}>Current date</option>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {new Intl.DateTimeFormat("en", {
                      month: "long",
                      timeZone: "UTC",
                    }).format(Date.UTC(2026, i, 15))}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="environment-lab-actions">
            <button type="button" onClick={restoreLive}>
              <ClockCounterClockwise size={16} /> Return to live
            </button>
            <button
              type="button"
              aria-pressed={timeline}
              onClick={() => {
                setTimeline((v) => !v);
                dial.setValues({ enabled: true, clock: { liveTime: false } });
              }}
            >
              Day timeline
            </button>
          </div>
          <p className="environment-lab-hint">
            Sunrise{" "}
            {formatClockMinutes(
              solarDay(worldNow(), selection.month).sunrise * 60,
            )}{" "}
            · Sunset{" "}
            {formatClockMinutes(
              solarDay(worldNow(), selection.month).sunset * 60,
            )}
          </p>
          <div className="environment-lab-controls">
            <DialRoot mode="inline" theme="dark" productionEnabled />
          </div>
          <p className="environment-lab-status" role="status">
            {status || "Changes saved for this time and weather."}
          </p>
        </aside>
      )}
      {open && values.reference.show && values.reference.image && (
        <figure
          className="environment-lab-reference"
          data-dialkit-ignore
          style={{ opacity: values.reference.opacity }}
        >
          <img src={values.reference.image} alt="Lighting mood reference" />
          {values.reference.notes && (
            <figcaption>{values.reference.notes}</figcaption>
          )}
        </figure>
      )}
      {timeline && <DayTimeline />}
    </>
  );
}

export default function EnvironmentLab({
  onEditing,
}: {
  onEditing: (active: boolean) => void;
}) {
  const [selection, setSelection] = useState<ProfileSelection>(() => {
    try {
      return readProfileSelection(localStorage, worldNow());
    } catch {
      return { time: "noon", weather: "clear", month: 0 };
    }
  });
  const [requested, setRequested] = useState(0);
  return (
    <ProfileEditor
      selection={selection}
      requested={requested}
      onEditing={onEditing}
      onSelect={(next) => {
        setRequested((v) => v + 1);
        setSelection(next);
        try {
          rememberProfile(localStorage, next);
        } catch {}
      }}
    />
  );
}
