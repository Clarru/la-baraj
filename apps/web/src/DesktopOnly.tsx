/** Deliberately shown before onboarding and the lazy-loaded 3D game. */
export function DesktopOnly() {
  return (
    <main className="name-welcome desktop-only">
      <h1>
        <img
          className="name-welcome-logo"
          src="/assets/brand/la-baraj-banner.webp"
          alt="La Baraj"
          width={768}
          height={256}
        />
      </h1>
      <img
        className="name-welcome-lake"
        src="/assets/ui/lake-vignette.webp"
        alt=""
        width={960}
        height={640}
      />
      <section
        className="name-welcome-card desktop-only-card"
        aria-labelledby="desktop-only-title"
      >
        <h2 id="desktop-only-title">Join us on a computer</h2>
        <p>
          La Baraj needs a keyboard and mouse. Open this link on a computer to
          join your friends at the lake.
        </p>
        <p className="desktop-only-address">la-baraj.vercel.app</p>
      </section>
    </main>
  );
}
