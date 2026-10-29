# Playful punches

Press Q while walking on the ground to punch in the direction the character is facing. The room chooses the nearest eligible player within two world units and a forward arc. Punches have a 1.2-second cooldown. A hit stuns for two seconds, and the recipient cannot be hit again for a further second. The camera stays usable. Seated, swimming, and scooter-riding players cannot punch or be hit; other activities are protected too. Repeated keydown does not repeat a punch. The Controls panel documents the binding.

The room broadcasts each accepted swing (including a miss) and applies the hit decision and cooldown in websocket session attachments. There is no persistent combat or world data. Clients animate from the event and use a local monotonic timer; delivery latency can produce small timing differences. A client that has not refreshed since release will not yet react to punch events.

The two animation clips are extracted from the existing Quaternius `human_male.glb` source as `Punch_Jab` and `Hit_Head`, using the same rig and extraction process as the other character actions; no change to the approved model. See the character asset licensing documentation for the original source and license. Rebuild with `scripts/extract-activity-clips.mjs` after making the original source available under `assets/character-source/`.
