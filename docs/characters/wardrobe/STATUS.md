# Wardrobe implementation status

This is an in-progress feature branch. Nothing here replaces the live character.

The approved male GLB and all runtime source remain unchanged. Source packs are
the official free Standard Quaternius CC0 downloads; manifests and license notices
are retained. Raw archives, downloaded models and editable Blender scenes are
ignored local source; scripts reconstruct the exports.

Current evidence:

- Three real hair meshes exported and optimized, each with the canonical 65-bone
  bind, plus the existing beard. See render/hair-exported-v1.png.
- Three modeled hats exported with head skinning: six-panel cap, folded beanie
  and stitched bucket. Their exported bind contract passes. The cap review found
  an oversized crown; its authoring profile is corrected pending a fresh render.
- Connected charcoal knit top exported and reviewed in front/side/rear and
  walk/run/jump poses. Rear elbow skin exposure was corrected by retaining only
  the covered sleeve's hands. Collar, cuffs and hem gained modeled rib bands.
  The retained approved neck has an irregular lower boundary that is still visible
  with this collar; this must be corrected before acceptance.
- Female reference outfit now has an initial rigged, complete-component Blender
  prototype with the official female base, long brunette hair, open blazer,
  notched lapels, cropped underlayer, tailored shorts, belt/gold buckle, tights
  and pointed pumps/heels. Its exported visual/fit review is still pending.

ImageGen references, exact prompts, input roles and the actual sweater paintover
are retained under references/. Shared tintable knit/twill albedos are retained
under assets/wardrobe-source/textures/. Concepts and paintovers are not evidence
of finished meshes.

All five men's slots now have at least three modeled candidates: the approved
workshirt/trousers/boots plus distinct custom overshirt/knit, cargo/shorts,
hiking/canvas shoes, three hairstyles and three hats. Separate high-boot,
ankle-boot and low-shoe fit exports prevent uncovered ankles and skin inside
opaque boots. A short beard and moustache are also being fitted.

The shared schema, selected-asset resolver, safe skeleton attachment and optional
owner profile store have focused passing tests. These modules are not wired into
the live renderer or network yet. Skeleton attachments reuse one canonical
skeleton per actor and share immutable geometry; only per-actor materials will
carry colour changes. The original appearance selects zero extra downloads.

The client/server and local/remote renderer are now connected, with an optional
Menu → Appearance dialog, real rotatable on-demand 3D preview, category focus,
body/garment/hair/facial-hair selections, colours and staged Apply/Cancel.
Default appearances still request no additional wardrobe files. Classic trouser
dyes use a neutral albedo on a separate UV set while retaining the approved
normal/roughness atlas, so pale colours do not multiply a brown atlas into brown.

No garment or hat has final visual acceptance. The first 243-combination front/rear
render pass found the guessed hiking collar floating around the ankle. It was
replaced by a bound rim extruded directly from the source last; a repeated review
is required. Browser UI, activity poses and performance acceptance remain pending.
The localhost-only paired fixture uses the real RoomCore and two MultiplayerRoom
clients over an in-browser channel, never a backend listener or production socket.

Focused tests pass for bounded IDs, all configuration combinations,
fit resolution, bind mismatch rejection, geometry/texture sharing, durable save
failure/retry and receipt ordering. TypeScript checks pass for client and server.
The full frontend suite passes 581 tests. All 182 protocol tests and client/server
TypeScript checks pass. The normal production build and isolated fixture build
pass. The packed model hashes are checked against the allowlisted URL versions.
Ordinary movement packets preserve the existing cosmetic object without parsing
or serializing its fields again.
Its first read-only preflight found no conflicting paths or shared dependency
differences against the release owner's protected normal/editor preview.

No shared preview, release checkout, live world state or deployment has been
changed by this feature chat. Runtime GLBs are explicitly packed as preview
candidates; final packing requires a matching visual acceptance record.
