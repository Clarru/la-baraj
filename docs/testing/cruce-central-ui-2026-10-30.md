# Cruce central status, automatic calls and card frame

The previous interface placed live turn/dealer/time information in the sidebar and explanatory rules on the felt. The felt now carries the actor, dealer, visible thinking timer and reconnect/recovery state; scores/settings/actions remain in the existing side column. Tutorial prose is kept in the rules view. The square grows to the available stage size instead of stopping at600px.

A legal leading Treiar/Pătrar pair is announced automatically by the authority, including legacy clients sending announce:false. Explicit invalid announce:true requests remain rejected. Calls remain once per color, require both cards, and do not happen when following a trick. Winning bids and current20/40 declarations get a material plaque under the player's name. Bid buttons and rank captions use Arabic numerals; the authentic printed card art remains intact.

The24 source faces are opaque363x585 images with black outside their rounded stock. The shared26px source radius now drives the UI border curve and rounded geometry/UVs for held, flying and public tabletop cards. The original textures and full face framing remain the same.

The plaque is an original transparent built-in ImageGen bitmap. Prompt/provenance: docs/art-direction/cruce/announcement-prompt.json; runtime apps/web/public/assets/cruce/announcement-plaque-v1.webp. Numbers and accessible labels are live HTML. Reduced motion disables the call entrance and timer interpolation.

Validation before browser acceptance:374 frontend tests,135 protocol tests, frontend/server TypeScript, normal/opt-in QA bundles and layout detector[]. New regressions cover automatic20/40 for announce:false, ordinary/following/repeated plays, UI action payload/no checkbox, central status/offline timer, Arabic labels and rounded geometry/UVs. Existing complete-hand tests now verify120 card points plus legitimate announcement bonuses.

Visual/paired-browser proof and shared preview restoration will be appended before release. The QA-only scenario fixture and build script are absent from normal entry traversal.
