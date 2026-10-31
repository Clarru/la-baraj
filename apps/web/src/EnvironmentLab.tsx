import { useEffect, useRef, useState } from "react";
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
import "dialkit/styles.css";
import "./environment-lab.css";

const config = {
  enabled: false as boolean,
  clock: {
    liveTime: true as boolean,
    hour: [12, 0, 23.99, 0.01],
    dawn: { type: "action", label: "Dawn · 05:30" },
    morning: { type: "action", label: "Morning · 08:00" },
    noon: { type: "action", label: "Noon · 12:00" },
    goldenHour: { type: "action", label: "Golden hour · 18:00" },
    dusk: { type: "action", label: "Dusk · 20:00" },
    midnight: { type: "action", label: "Midnight · 00:00" },
  },
  weather: {
    liveWeather: true as boolean,
    look: {
      type: "select",
      options: [
        { value: "clear", label: "Clear" },
        { value: "partly", label: "Partly cloudy" },
        { value: "overcast", label: "Overcast" },
        { value: "mist", label: "Lakeside mist" },
        { value: "rain", label: "Rain light" },
        { value: "storm", label: "Storm light" },
        { value: "snow", label: "Snow light" },
      ],
      default: "clear",
    },
    applyLook: { type: "action", label: "Apply weather look" },
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
  reset: { type: "action", label: "Reset all controls" },
} satisfies DialConfig;

const times: Record<string, number> = {
  dawn: 5.5,
  morning: 8,
  noon: 12,
  goldenHour: 18,
  dusk: 20,
  midnight: 0,
};

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

export default function EnvironmentLab({
  onEditing,
}: {
  onEditing: (active: boolean) => void;
}) {
  const [open, setOpen] = useState(true);
  const [timeline, setTimeline] = useState(false);
  const [status, setStatus] = useState("");
  const actions = useRef<(path: string) => void>(() => {});
  const dial = useDialKitController("Lake lighting & weather", config, {
    id: "la-baraj-environment-v1",
    persist: true,
    onAction: (path) => actions.current(path),
  });
  const values = dial.values;
  actions.current = (path) => {
    if (path.startsWith("clock.")) {
      const hour = times[path.slice(6)];
      if (hour !== undefined) {
        setTimeline(false);
        dial.setValues({ enabled: true, clock: { liveTime: false, hour } });
      }
    }
    if (path === "weather.applyLook") {
      const look =
        weatherLooks[values.weather.look as keyof typeof weatherLooks];
      if (look)
        dial.setValues({
          enabled: true,
          weather: { liveWeather: false, cloudCover: look.cloudCover },
          light: { sun: look.sun },
          atmosphere: {
            fogNear: look.fogNear,
            fogFar: look.fogFar,
            wind: { ...look.wind },
          },
          water: { distortion: look.distortion },
        });
    }
    if (path === "palette.sampleTime") {
      const light = lightingAt(
        values.clock.liveTime
          ? gameMinutes(worldNow()) / 60
          : values.clock.hour,
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
      setStatus("Controls reset. Live time and weather restored.");
    }
    if (path === "exportSettings") {
      const blob = new Blob(
        [JSON.stringify({ schema: 1, ...dial.getValues() }, null, 2)],
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
    setEnvironmentTuning(values);
  }, [values]);
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
              <strong>Shape the atmosphere</strong>
              <p>Local preview · edits saved in this browser</p>
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
            {values.enabled
              ? timeline
                ? "Timeline controls the time of day."
                : values.clock.liveTime
                  ? "Following Romanian time."
                  : `Previewing ${formatClockMinutes(values.clock.hour * 60)}.`
              : "Live world · enable edits below to resume tuning."}{" "}
            Weather looks shape light, haze, clouds and waves.
          </p>
          <div className="environment-lab-controls">
            <DialRoot mode="inline" theme="dark" productionEnabled />
          </div>
          <p className="environment-lab-status" role="status">
            {status ||
              "Save versions to compare moods. Copy or export to keep a recipe."}
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
