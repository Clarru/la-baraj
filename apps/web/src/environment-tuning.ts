import * as THREE from "three";

/** The editor is local to this browser. Never write these values to the room. */
export const environmentLabEnabled =
  typeof location !== "undefined" &&
  ["localhost", "127.0.0.1"].includes(location.hostname);

export type EnvironmentTuning = {
  enabled: boolean;
  clock: { liveTime: boolean; hour: number };
  weather: { liveWeather: boolean; cloudCover: number };
  light: {
    sun: number;
    hemisphere: number;
    ambient: number;
    exposure: number;
    shadows: boolean;
    manualSun: boolean;
    sunPosition: { x: number; y: number };
    ground: string;
  };
  atmosphere: {
    fogNear: number;
    fogFar: number;
    cloudScale: number;
    cloudOpacity: number;
    wind: { x: number; y: number };
  };
  palette: {
    customColors: boolean;
    sky: string;
    horizon: string;
    fog: string;
    land: string;
    sun: string;
    hemi: string;
    water: string;
  };
  water: { waveSpeed: number; distortion: number; size: number };
};

export const environmentDefaults: EnvironmentTuning = {
  enabled: false,
  clock: { liveTime: false, hour: 12 },
  weather: { liveWeather: false, cloudCover: 0 },
  light: {
    sun: 1,
    hemisphere: 1,
    ambient: 1,
    exposure: 0.92,
    shadows: true,
    manualSun: false,
    sunPosition: { x: -137, y: 49 },
    ground: "#7c8458",
  },
  atmosphere: {
    fogNear: 480,
    fogFar: 3300,
    cloudScale: 1,
    cloudOpacity: 0.55,
    wind: { x: 1, y: 0 },
  },
  palette: {
    customColors: false,
    sky: "#82b0c7",
    horizon: "#bed0be",
    fog: "#aec5b5",
    land: "#ffffff",
    sun: "#ffe2b3",
    hemi: "#eef1db",
    water: "#145b61",
  },
  water: { waveSpeed: 0.45, distortion: 0.65, size: 7.5 },
};

let tuning: EnvironmentTuning | null = null;
let revision = 0;
let timelineHour: number | null = null;
let palette: Partial<Record<keyof EnvironmentTuning["palette"], THREE.Color>> =
  {};
let ground = new THREE.Color(environmentDefaults.light.ground);

/** Canvas normalizes Dialkit's OKLCH / P3 / RGB / HSL output to Three's sRGB input. */
export function lightingColor(css: string): THREE.Color {
  if (/^#[\da-f]{6}$/i.test(css)) return new THREE.Color(css);
  if (typeof document !== "undefined") {
    const context = document
      .createElement("canvas")
      .getContext("2d", { willReadFrequently: true });
    if (context) {
      context.fillStyle = css;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
      return new THREE.Color().setRGB(
        r / 255,
        g / 255,
        b / 255,
        THREE.SRGBColorSpace,
      );
    }
  }
  return new THREE.Color(css);
}

export function setEnvironmentTuning(next: EnvironmentTuning | null) {
  tuning = next;
  revision++;
  if (next) {
    ground = lightingColor(next.light.ground);
    palette = Object.fromEntries(
      Object.entries(next.palette)
        .filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        )
        .map(([key, color]) => [key, lightingColor(color)]),
    );
  }
}
export function setEnvironmentTimelineHour(hour: number | null) {
  timelineHour = hour;
  revision++;
}
export function environmentTuning() {
  return tuning?.enabled ? tuning : null;
}
export function environmentRevision() {
  return revision;
}
export function environmentHour() {
  const settings = environmentTuning();
  return settings
    ? (timelineHour ?? (settings.clock.liveTime ? null : settings.clock.hour))
    : null;
}
export function environmentColors() {
  return palette;
}
export function environmentGround() {
  return ground;
}

export const weatherLooks = {
  clear: {
    cloudCover: 0,
    fogNear: 480,
    fogFar: 3300,
    sun: 1,
    wind: { x: 1, y: 0 },
    distortion: 0.65,
  },
  partly: {
    cloudCover: 0.5,
    fogNear: 400,
    fogFar: 2800,
    sun: 1,
    wind: { x: 1.5, y: 0.3 },
    distortion: 0.8,
  },
  overcast: {
    cloudCover: 1,
    fogNear: 300,
    fogFar: 2200,
    sun: 0.85,
    wind: { x: 2, y: 0.5 },
    distortion: 1,
  },
  mist: {
    cloudCover: 0.8,
    fogNear: 20,
    fogFar: 360,
    sun: 0.65,
    wind: { x: 0.2, y: 0 },
    distortion: 0.3,
  },
  rain: {
    cloudCover: 1,
    fogNear: 70,
    fogFar: 1100,
    sun: 0.65,
    wind: { x: 3, y: 1 },
    distortion: 1.8,
  },
  storm: {
    cloudCover: 1,
    fogNear: 40,
    fogFar: 700,
    sun: 0.35,
    wind: { x: 6, y: 2 },
    distortion: 3,
  },
  snow: {
    cloudCover: 0.95,
    fogNear: 50,
    fogFar: 850,
    sun: 0.8,
    wind: { x: 0.8, y: 0.4 },
    distortion: 0.4,
  },
} as const;

/** Maintain a valid linear-fog interval even when its sliders cross. */
export function fogRange(near: number, far: number) {
  return { near, far: Math.max(near + 1, far) };
}
