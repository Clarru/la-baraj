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
      <div className="scene-loading__location" aria-hidden="true">
        <span>Lake Cinciș</span>
        <span>South shore / World study</span>
      </div>
      <section className="scene-loading__content" aria-label="Loading the lake">
        <div className="scene-loading__drawing" aria-hidden="true">
          <svg viewBox="0 0 240 112" fill="none">
            <path
              className="scene-loading__ridge scene-loading__ridge--far"
              d="M12 67 49 39 72 53 111 21 150 55 181 36 228 66"
            />
            <path
              className="scene-loading__ridge"
              d="M12 73 53 58 88 72 129 47 168 69 200 56 228 72"
            />
            <path className="scene-loading__shore" d="M12 79H228" />
            <path className="scene-loading__water" d="M61 88H179M85 97H155" />
            <path className="scene-loading__glint" d="M102 88H138" />
          </svg>
        </div>
        <h1 className="scene-loading__title">Down by the lake.</h1>
        <p className="scene-loading__description" role="status">
          {resourcesReady ? "Preparing your view" : "Unpacking the south shore"}
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
          <span>
            {determinate
              ? `${loaded} / ${total} resources`
              : "Gathering resources"}
          </span>
          <span>{determinate ? `${Math.round(percent)}%` : "Please wait"}</span>
        </div>
        <span
          className="scene-loading__detail"
          title={filename}
          aria-hidden="true"
        >
          {resourcesReady
            ? "Setting the scene"
            : filename || "Connecting to the shore"}
        </span>
      </section>
      <div className="scene-loading__footer" aria-hidden="true">
        <span className="scene-loading__signal" />
        Local world prototype
      </div>
    </div>
  );
}
