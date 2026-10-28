import { useProgress } from "@react-three/drei";
import "./scene-loading.css";

/** Suspense fallback. Resource counts come directly from Three's loading manager. */
export function SceneLoading() {
  const { progress, loaded, total, item } = useProgress();
  const determinate =
    total > 0 &&
    Number.isFinite(total) &&
    Number.isFinite(loaded) &&
    Number.isFinite(progress);
  const percent = determinate ? Math.max(0, Math.min(100, progress)) : 0;
  const resourcesReady = determinate && loaded >= total && percent === 100;
  const filename = item?.split(/[?#]/, 1)[0].split("/").pop();

  return (
    <div className="scene-loading" aria-busy="true">
      {import.meta.env.DEV && (
        <div className="scene-loading__location" aria-hidden="true">
          <span>La Baraj</span>
          <span>Lake Cinciș / South shore</span>
        </div>
      )}
      <section className="scene-loading__content" aria-label="Loading La Baraj">
        <h1 className="scene-loading__title">
          <img
            className="scene-loading__logo"
            src="/assets/brand/la-baraj-banner.webp"
            alt="La Baraj"
            width={768}
            height={256}
          />
        </h1>
        <img
          className="scene-loading__vignette"
          src="/assets/ui/lake-vignette.webp"
          alt=""
          width={960}
          height={640}
        />
        <p className="scene-loading__description" role="status">
          {resourcesReady ? "Nearly there…" : "Loading the lake…"}
        </p>
        <div
          className="scene-loading__track"
          data-determinate={determinate}
          role="progressbar"
          aria-label="Scene resources"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={determinate ? Math.round(percent) : undefined}
          aria-valuetext={
            determinate
              ? `${loaded} of ${total} resources loaded${resourcesReady ? "; preparing view" : ""}`
              : "Waiting for scene resources"
          }
        >
          <span
            className="scene-loading__fill"
            style={
              determinate
                ? { transform: `scaleX(${percent / 100})` }
                : undefined
            }
          />
        </div>
        <div className="scene-loading__readout" aria-hidden="true">
          {import.meta.env.DEV && (
            <span>
              {determinate
                ? `${loaded} / ${total} resources`
                : "Gathering resources"}
            </span>
          )}
          <span>{determinate ? `${Math.round(percent)}%` : "Please wait"}</span>
        </div>
        {import.meta.env.DEV && (
          <span
            className="scene-loading__detail"
            title={filename}
            aria-hidden="true"
          >
            {resourcesReady
              ? "Setting the scene"
              : filename || "Connecting to the shore"}
          </span>
        )}
      </section>
      {import.meta.env.DEV && (
        <div className="scene-loading__footer" aria-hidden="true">
          <span className="scene-loading__signal" />
          Local world prototype
        </div>
      )}
    </div>
  );
}
