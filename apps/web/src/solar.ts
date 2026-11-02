/** NOAA fractional-year solar equations, Lake Cinciș (same coordinates as weather).
 * https://gml.noaa.gov/grad/solcalc/solareqns.PDF
 * Approximate astronomical horizon; local hills/clouds can obscure the sun earlier.
 */
const rad = Math.PI / 180,
  latitude = 45.69 * rad,
  longitude = 22.85;
const dateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Bucharest",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const clockFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Bucharest",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
export function localSolarDate(now: number, month = 0) {
  const parts = dateFormat.formatToParts(now);
  const value = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(
    value("year"),
    (month || value("month")) - 1,
    month ? 15 : value("day"),
    12,
  );
}
function terms(date: number) {
  const d = new Date(date),
    year = d.getUTCFullYear();
  const days = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000;
  const gamma =
    ((2 * Math.PI) / days) * ((date - Date.UTC(year, 0, 1)) / 86400000 - 0.5);
  return {
    equation:
      229.18 *
      (0.000075 +
        0.001868 * Math.cos(gamma) -
        0.032077 * Math.sin(gamma) -
        0.014615 * Math.cos(2 * gamma) -
        0.040849 * Math.sin(2 * gamma)),
    declination:
      0.006918 -
      0.399912 * Math.cos(gamma) +
      0.070257 * Math.sin(gamma) -
      0.006758 * Math.cos(2 * gamma) +
      0.000907 * Math.sin(2 * gamma) -
      0.002697 * Math.cos(3 * gamma) +
      0.00148 * Math.sin(3 * gamma),
  };
}
function civilHour(timestamp: number) {
  const parts = clockFormat.formatToParts(timestamp);
  return (
    Number(parts.find((p) => p.type === "hour")?.value) +
    Number(parts.find((p) => p.type === "minute")?.value) / 60
  );
}
const daysCache = new Map<number, ReturnType<typeof calculateDay>>();
function calculateDay(date: number) {
  const { equation, declination } = terms(date);
  const midnight = date - 12 * 3600000;
  const noonUTC = 720 - 4 * longitude - equation;
  const halfDay = (altitude: number) =>
    (Math.acos(
      (Math.sin(altitude * rad) - Math.sin(latitude) * Math.sin(declination)) /
        (Math.cos(latitude) * Math.cos(declination)),
    ) /
      rad) *
    4;
  const event = (minutes: number) => civilHour(midnight + minutes * 60000);
  const sunrise = event(noonUTC - halfDay(-0.833)),
    sunset = event(noonUTC + halfDay(-0.833));
  return {
    date,
    sunrise,
    sunset,
    dawn: event(noonUTC - halfDay(-6)),
    dusk: event(noonUTC + halfDay(-6)),
    noon: event(noonUTC),
    equation,
    declination,
  };
}
export function solarDay(now: number, month = 0) {
  const date = localSolarDate(now, month);
  let day = daysCache.get(date);
  if (!day) {
    day = calculateDay(date);
    if (daysCache.size > 32) daysCache.clear();
    daysCache.set(date, day);
  }
  return day;
}
/** Civil hour to existing authored mood phases, anchored at real sunrise/twilight. */
export function solarPaletteHour(
  hour: number,
  day: ReturnType<typeof solarDay>,
) {
  const anchors = [
    [0, 0],
    [day.dawn, 5],
    [day.sunrise + 0.5, 7],
    [day.noon, 12],
    [day.sunset - 1, 17],
    [day.sunset, 19],
    [day.dusk, 21],
    [24, 24],
  ];
  hour = ((hour % 24) + 24) % 24;
  const i = anchors.findIndex(
    (a, i) =>
      i < anchors.length - 1 && hour >= a[0] && hour < anchors[i + 1][0],
  );
  const a = anchors[i],
    b = anchors[i + 1];
  return a[1] + ((hour - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
}
export function solarPosition(hour: number, day: ReturnType<typeof solarDay>) {
  // Solar noon already includes Romanian DST; hour angle avoids device timezone.
  const angle = (hour - day.noon) * 15 * rad;
  const elevation = Math.asin(
    Math.sin(latitude) * Math.sin(day.declination) +
      Math.cos(latitude) * Math.cos(day.declination) * Math.cos(angle),
  );
  const azimuth =
    Math.atan2(
      Math.sin(angle),
      Math.cos(angle) * Math.sin(latitude) -
        Math.tan(day.declination) * Math.cos(latitude),
    ) + Math.PI;
  return {
    elevation: elevation / rad,
    azimuth: azimuth / rad,
    x: Math.sin(azimuth) * Math.cos(elevation),
    y: Math.sin(elevation),
    z: -Math.cos(azimuth) * Math.cos(elevation),
  };
}
