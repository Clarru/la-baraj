# Planes at La Baraj

## Direction contract

THESIS: A familiar game of Avioane on squared exercise-book paper, played by two friends who remain seated in the existing lakeside world.

OWN-WORLD: Inherit the timber furniture, accepted male character, Bree Serif headings, Alegreya Sans body/supporting text and illustrated signs. The game adds ivory paper (#f7f3e8), navy pencil (#244b70), muted blue rules (#a4bace) and brick-red hits (#a44937).

STORY: Walk to the west picnic table by the dock, sit opposite a friend, place three planes and trade shots. The server keeps hidden layouts private. Nearby friends may watch public shots.

FIRST VIEWPORT: Seated avatars and the lake remain visible on the left; a readable paper sheet sits at bottom right. Your planes appear beside the opponent target grid. The circular minimap stays bottom left.

FORM: User-pinned squared paper, implemented as a local extension of the existing game. No concept roll or replacement identity. Code-led; ImageGen supplies blank paper and a furniture reference rather than game coordinates or text.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Play

The table beside the west dock has two game seats. F sits or stands using the existing activity system. Sitting joins the table and opens the paper. Esc folds/reopens it without leaving your seat or discarding edited placement; opening Menu also preserves that draft. Standing during play forfeits. Normal benches remain normal benches.

Each player hides three non-overlapping ten-square aircraft on a 10×10 grid. Drag any part of a plane to move it. The preview is green when the placement fits and red when it does not; an invalid drop leaves the plane in place. Press R to rotate, including while dragging, or select a plane and use the arrow keys. Clicking an empty square can also reposition the selected cockpit. Shuffle produces a legal fleet. The optional How to play guide explains the rules. Both players must be online and press Ready. Turns alternate, including after a hit. A body hit is a clue; a cockpit hit reveals and destroys that aircraft. Three destroyed aircraft wins. A rematch deals a fresh editable layout and requires both players to agree.

Placement allows 120 seconds; turns allow 60. A lost connection pauses play and reserves the role for 30 seconds. Returning cabin owners resume with their existing verified capability; it is never sent to spectators. A second active tab cannot steal the role. An expired connection, timed-out turn or explicit departure releases its game seat.

## Implementation and limits

`packages/shared/planes.ts` owns rules and wire types. `apps/server/planes-table.ts` serializes durable mutations and projects a distinct view for each socket. Only its owner's fleet is sent privately; destroyed planes and shots are public. The match is stored at `planes-table-v1` in the existing canonical Durable Object, with one earliest alarm shared with cabin-name confirmation. No new service, paid dependency or simulation loop.

The existing west picnic furniture is reused with two semantic seats, public blank graph-paper props, pencils and a small sign. The board is lazy loaded. Subtle additive upper-body reactions follow discrete shot events; no extra pose stream or replacement character model. This version has one shared table, two players, nearby spectators and no AI opponent or first-person hand rig.

The explicit localhost-only lab runs the actual room/parser/rules in RAM. Test homes never reach localStorage or the live Worker. Normal production builds exclude lab controls, fixture server code and diagnostics. The production world, housing epoch and home ledger are preserved.

## Verification

Run `npm test`, `npm run test:protocol`, `npm run server:check`, and `npm run build` with Node 24. Browser checks cover placement, readiness, actual grid shots, a full round, fresh rematch, reconnect, fold/reopen and stand-up. Live WebSocket verification uses temporary nickname-only guests without allocating homes, checks that the table is empty before joining and always leaves both seats. The fire and cabin roster are compared before and after.

Art provenance: [art-direction/planes](art-direction/planes/README.md). Existing DESIGN.md remains the incumbent authority; this is an extension, not a visual-system rewrite.
