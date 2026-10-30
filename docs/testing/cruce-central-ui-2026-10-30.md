# Cruce central status, automatic calls and card frame

The previous interface placed live turn/dealer/time information in the sidebar and explanatory rules on the felt. The felt now carries the actor, dealer, visible thinking timer and reconnect/recovery state; scores/settings/actions remain in the existing side column. Tutorial prose is kept in the rules view. The square grows to the available stage size instead of stopping at600px.

A legal leading Treiar/Pătrar pair is announced automatically by the authority, including legacy clients sending announce:false. Explicit invalid announce:true requests remain rejected. Calls remain once per color, require both cards, and do not happen when following a trick. Winning bids and current20/40 declarations get a material plaque under the player's name. Bid buttons and rank captions use Arabic numerals; the authentic printed card art remains intact.

The24 source faces are opaque363x585 images with black outside their rounded stock. The shared26px source radius now drives the UI border curve and rounded geometry/UVs for held, flying and public tabletop cards. The original textures and full face framing remain the same.

The plaque is an original transparent built-in ImageGen bitmap. Prompt/provenance: docs/art-direction/cruce/announcement-prompt.json; runtime apps/web/public/assets/cruce/announcement-plaque-v1.webp. Numbers and accessible labels are live HTML. Reduced motion disables the call entrance and timer interpolation.

Validation before browser acceptance:374 frontend tests,135 protocol tests, frontend/server TypeScript, normal/opt-in QA bundles and layout detector[]. New regressions cover automatic20/40 for announce:false, ordinary/following/repeated plays, UI action payload/no checkbox, central status/offline timer, Arabic labels and rounded geometry/UVs. Existing complete-hand tests now verify120 card points plus legitimate announcement bonuses.

Browser proof and shared preview restoration follow below. The QA-only scenario fixture and build script are absent from normal entry traversal.

## Browser acceptance

Runtime `5aabce09ddf84b4ddfec48c56e417de57f2237a6` includes released Planes45/main462252f. One initial visual round found that central status consumed too much vertical space at short heights. The sole repair compacted dealer/countdown into one row, reduced secondary hand/footer chrome, and changed the public trick arrangement to preserve readable cards.

The confirmation round passed2/3/4-seat scenes and long names at1280x720,1440x900 and391x844. The square measures422.6px at1280x720 (previous393.5px),564.8px at1440x900 (previous531.7px), and744.8px at1920x1080 (previous600px cap). Desktop hand cards stay96–112px; public Duel/four-player card bounding widths are approximately116/87px at1280. Narrow scrollWidth equals viewport and side labels no longer intrude into central information. Away/disconnected states suppress the active timer; the overdue state explicitly allows continued play. Lobby and round-end states show compact factual status. Independent layout confirmation: SHIP.

Captures: [Duel](captures/cruce-central-ui/duel-final.webp), [four players](captures/cruce-central-ui/four-final.webp), [three-player bidding](captures/cruce-central-ui/trio-final.webp), [narrow compatibility](captures/cruce-central-ui/narrow-final.webp). The scenario fixture is illustrative visual QA of the real component; actual authority evidence follows separately.

Two independent real game clients occupied south/north with F, configured Duel, confirmed ready and bid using the normal UI. The naturally dealt green pair was led with Treiar13; the ordinary card click automatically announced40 to both clients. After the first trick's normal draw, the same player held the bell pair and led Treiar7; the ordinary click automatically announced20. Both clients reported total announcements60 and the badge belonged to the correct player: opponent position2 in one view, own position0/Tu in the other. Neither view contained an announcement checkbox. [Real40](captures/cruce-central-ui/real-automatic40.webp), [real20](captures/cruce-central-ui/real-automatic20.webp), [packet/UI replay](captures/cruce-central-ui/real-calls.json), [placement/totals](captures/cruce-central-ui/call-placement.json).

A real turn subsequently exceeded its soft deadline. The center displayed `Poți juca în continuare` and0s. A normal late As5 click was accepted, removed the card and advanced to trick/revision15 without finishing the match. [Overdue UI](captures/cruce-central-ui/real-afk-continue.webp), [accepted late action](captures/cruce-central-ui/late-action.json).

The freshly rebuilt retained-character fixture uses the production mesh, animation/controller and card geometry factory. Its grip close-up shows rounded cards without opaque corner triangles, with the existing hand/table contact retained. [Actual retained character](captures/cruce-central-ui/rounded-actual-hand.webp). Both real clients and the3D fixture had empty browser error logs.

Both real players left via the normal active-match confirmation. The authority had empty seats and all four Cruce members null before owned clients closed. All owned QA tabs14–17 closed; original user tabs were not changed. The sole4173 process PID12514 was reused. All24 owned additions were removed; the complete236-file SHA map matches the fresh backup exactly, including index `4cb2a733a94bb57f1850ea75af30ab8ae10c841710d49ad57ac3b3b66fd4162f`. [Cleanup](captures/cruce-central-ui/client-cleanup.json), [restoration](captures/cruce-central-ui/restoration.json).

Final combined validation after merging45:386 frontend tests,135 protocol tests, both TypeScript checks, normal/QA/retained-character builds and Worker dry-run. Release owner independently verified the exact runtime's full suites/normal build and reviewed automatic-announcement validation plus cached geometry lifetime. API42's emitted `.js` import and recovery stay intact; Game differs from45 only by the Cruce onSync prop, preserving its result-countdown keyboard guard.
