# Female waist coverage correction

The live female outfit still showed the cropped top because its earlier repair
was excluded from the hats-only release. This branch is based on that deployed
release (d4643f8) and changes one female model plus its description.

The high-neck underlayer now extends to 1.015m below the waistband (shorts reach
1.089m, belt starts at 1.047m). Covered abdominal skin is removed from the export.
The same asset also includes the previously requested thigh-fit correction:
shorts are fitted outside the actual female body and use its skinning weights;
hidden upper tights are trimmed so they cannot protrude through the shorts.

The head, hair, eyebrows, blazer style, shoes, skeleton and retained animations
are preserved. All hats and every other clothing GLB remain unchanged.

A regression test reads the actual shipped GLB: exposed skin must remain above
1.2m in the bind pose, and the underlayer must extend below 1.035m. This rejects
the previous cropped asset even if authoring-source code is fixed but not packed.

Visual checks and bounded shared-preview acceptance are pending. No backend,
protocol, identity, home allocation or storage migration change is required.
