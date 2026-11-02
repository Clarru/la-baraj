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

No garment or hat has final visual acceptance. Men's second custom top, additional
bottoms/shoes, all-combination/adverse-pose QA, runtime loading, Appearance UI,
persistence/multiplayer synchronization and game acceptance remain required.
No shared preview, release checkout, world state or deployment has been changed.
