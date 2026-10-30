# 2048 finish review — final scoped verdict

Disposition: **ship** for the frozen source/art and bounded desktop-browser acceptance scope at runtime candidate `9ab4427fd97336ab2aadb9308d357a39fcaaabd4`.

An independent fresh subagent used Impeccable's fallback finish-review contract because the named finish-reviewer role was unavailable. A separate fresh documentation subagent used its fallback contract. The implementation thread did not substitute its own review for those passes. The single UI detector run returned `[]`; it was not rerun.

| Finding / gate | Final disposition |
| --- | --- |
| Win plus no moves incorrectly resetting on Keep going | Resolved; uncontinued win takes precedence, with hook regression. |
| Local-practice proximity and accessible-record labels | Resolved; local/ranked names are explicit. |
| Accessible confirmation cancellation name | Resolved as Keep this game. |
| Keyboard-only confirm/continue gap identified by shared integration review | Resolved by actual Game's `captureArcadeKey`, five DOM/window tests and real Enter/Space confirmation. Plain-board Enter remains inert. |
| Quantization changing joystick origin | Resolved by a semantic parent hinge; decoded-coordinate/child-mesh regression. |
| Actual browser gate | Resolved at the stated desktop release scope; real Game, physics, mesh, Canvas screen and SharedWorker exercised. |
| Two private boards, shared local records, personal resume/reload | Resolved; distinct home identities and exact 16-cell / score-best comparisons. |
| Capture validity and shared-preview cleanup | Resolved; named browser images opened, owned clients closed, all 251 normal paths/hashes/byte sizes restored. |

Evidence: [browser report](../../docs/testing/arcade2048-2026-10-30.md), [reload result](../../docs/testing/captures/arcade2048/desktop-reload-resumed.jpg), [paired records](../../docs/testing/captures/arcade2048/paired-records.jpg), [confirmation](../../docs/testing/captures/arcade2048/desktop-confirm.jpg), [narrow desktop](../../docs/testing/captures/arcade2048/narrow-desktop.jpg), [restoration](../../docs/testing/captures/arcade2048/restoration.json).

Remaining scope limits are explicit: no genuine mobile-UA/touch or browser reduced-motion emulation, no manufactured/reached browser2048 win, no browser same-owner race or injected storage failure, and no production/global-ranking deployment. The relevant rule/revision/idempotency/rollback/restart/private-reply paths have automated test coverage. Existing desktop-only device gating is preserved. Narrow fine-pointer desktop retains a minimap overlap over the lower hint/deck area; the board, main actions and Leave are visible, and the preview owner accepted that scope without a layout repair. Earlier Blender projections are not browser proof.

The final review reported no observed regression in the scored correction batch. Checks at the merged runtime candidate: 401 frontend tests, 148 protocol/backend tests, both TypeScript checks and production build. The shipping cabinet remains 245,680 bytes and 7,082 triangles.

## Subsequent backend resource amendment

The same independent reviewer separately reviewed the [daily logical-save budget](../../docs/testing/arcade2048-write-budget.md) and returned **ship** with no concrete blocker. The optional per-owner day/count meter is persisted in the same record, summed under the existing serial queue, and is not exposed in the public view. Success-only charging, unchanged/no-op/dedup exclusions, legacy loading, restart/UTC rollover and last-slot races are covered. An actual Worker test proves an exhausted arcade meter leaves its board unchanged while an unrelated fire save still succeeds. The default is 50,000 logical ranked saves/day; this is not a guarantee about all Cloudflare billing dimensions. Local practice bypasses it. No asset, camera, input or accepted browser behavior changed.

Final mechanical checks after this amendment: 401 frontend tests, 159 protocol/backend tests, both TypeScript checks and production build passed. Production Worker/frontend release remains the release owner's responsibility.
