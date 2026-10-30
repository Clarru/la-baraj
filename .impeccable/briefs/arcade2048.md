# 2048 cabinet — direction and acceptance

The user asked for a new 2048 arcade cabinet in La Baraj using the measured 3D prop process developed in this chat. Their referenced chat, “Explore three gameplay UX directions”, asks for a nostalgic floor-standing machine with the game actually playing on its mesh screen. Its earlier concept is inspiration, not an exact dimensional contract.

Confirmed decisions: no Undo button or action; personal saved board per player; a global leaderboard; preserve the existing world and use the current timber, worn iron, forest green, paper, ochre and terracotta direction. The board follows the familiar 2048 hierarchy with title, Score, Best, New game and Scores. Reuse the world’s Bree Serif and Alegreya Sans fonts. Do not replace the React/R3F stack.

Accomplish: walk to the cabinet, resume a personal game, combine tiles and pursue a global record. Notice: this belongs to the same world as the accepted timber/iron props; the screen is live and legible. Feel: a familiar, tactile arcade machine, with responsive restrained motion.

The extension owns Arcade2048, its screen renderer/controller, shared rules/station, server persistence and tests. Shared Game, CameraRig, protocol and multiplayer hooks should be minimal. The player stays in place and is locally hidden during camera focus so their body cannot block the screen. Other players still see their normal standing avatar. No full-screen DOM game panel.

Server computes each move, random spawn and score. One durable row per cabin owner contains board and best, committed before acknowledgement. Rankings read those records; no client score submission. Revision checks serialize two tabs; request IDs deduplicate retries. Board replies are private. Leaderboard exposes names/scores, never credentials. A new snapshot capability prevents sending unsupported messages to an older Worker. Local preview is explicitly unranked practice.

Motion: 150ms tile slides/merge pops; physical button and joystick feedback; ~500ms camera focus. Reduced motion removes tile/hardware animation and makes focus immediate. Texture uploads occur only when dirty/animating, capped at 30Hz. Cabinet GLB loads within 65m, under its own Suspense boundary, without holding up world arrival. One scoped cached environment preserves metal reflections without changing global materials.

Validate actual exported geometry, PBR maps, node names, screen UVs, terrain contact, world distance, rules, persistence/restart, failed writes, private replies, stale tabs and input rate. The original private build is not automatically the shared 4173 preview. Never start another server. Renderer captures and Blender re-imports cover only the evidence they show; browser integration must be described separately.

Generated reference: experiments/asset-skill-lab/arcade/reference.png. Accepted style anchor: experiments/asset-skill-lab/crate/final/qa/three-quarter.png. Code-led local extension; no approved pixel-perfect web comp. Preserve incumbent DESIGN.md/.impeccable/design.json; pre-existing documentation drift is outside this change.

## Human follow-up: smooth tile motion and a stable footer

The user reports blurry/juddery lateral tile slides and a footer that changes while saving. Preserve the visual identity, geometry, server authority, persistence and existing controls. Replace the active footer with exactly “Use WASD or mouse to move them”, stable across pending/idle states. Remove the display's 30Hz animation bottleneck without uploading the entire768x960 screen60times/second. Cache tile artwork, animate small GPU instance transforms at the renderer's frame cadence, retain reduced-motion behavior and modal/error layering, bound textures/draw calls, and measure frame/update costs in actual-world browser QA. No constant60fps guarantee across all hardware; report measured scope.
