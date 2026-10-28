# La Baraj — Product requirements

Version: 1.0 baseline · 28 October 2026

## 1. Product

La Baraj is a browser multiplayer playground for an existing Romanian UX design community. Friends arrive at their own cabin, explore the lake, collect peculiar objects, chat, and chase each other over a stealable trophy.

The intended feeling is: “I'm heading down to the lake. Let's see who's there.”

The community includes men around 30–45 who already enjoy games. This informs the social setting, not a requirement for workplace jokes or design-themed quests. All interface text, instructions, item descriptions and game messages are English. The game name is **La Baraj**. Use `la-baraj` for public project and service identifiers. **Lake Cinciș** names the real map/location, not the game.

## 2. Decisions established with the owner

- Browser game, noncommercial, as inexpensive as practical to host.
- Up to **30 simultaneous players** in one shared world.
- The real Lacul Cinciș provides the terrain, roads, shoreline and lake layout.
- The inhabited area follows the **south, road-facing shore of the wider basin** shown in the owner's reference. The opposite **north shore is forest, with no cabins**.
- Houses and other buildings are original game content. Do not import real building footprints, businesses, addresses or house models from the map.
- Each player owns a persistent cabin and personal belongings.
- Cabin appearance is automatically assigned from curated variations on arrival. No customization wizard or onboarding checklist.
- Personalization is available after entering the world and can deepen in later releases.
- The lake has actual activities. Walking around a pretty map is insufficient.
- Players can punch each other, with a **two-second stun** as the starting rule.
- Reuse existing software and art wherever it saves time and fits the licenses.

The remaining rules in this document are concrete implementation defaults chosen to make these decisions buildable. Timing and balance can change through playtesting without reopening the product concept.

## 3. Scope and platform

The first release supports desktop/laptop browsers with keyboard and mouse, one invite-only community world, and short or long drop-in sessions. Voice can happen in the community's existing call app; built-in voice is deferred.

Thirty concurrent players does not specify total membership. Build 30 persistent cabin plots for the founding cohort. Never reassign someone's plot because they go offline. Additional owners require a planned map expansion; show a clear capacity message when all plots are claimed. Existing members can return. The 31st simultaneous player sees “The lake is full. Try again in a moment.” and a Retry action, rather than spawning an extra avatar.

## 4. Geography and world layout

Use actual Cinciș shoreline and selected road centerlines as geographic inputs. Preserve their spatial relationship. Obtain elevation separately; a shoreline map does not contain hillside heights. Stylize terrain, vegetation, materials and lighting.

Keep the full recognizable lake as scenery and map context. The owner has selected the **south, road-facing shore of the wider basin** as the main inhabited area; see [the supplied area reference](../assets/geography/inhabited-area-reference.png). Concentrate the first playable settlement there so 30 players can find each other. Preserve that sector's actual geography. The opposite **north shore remains forest, with no cabins or settlement buildings**. This is the intended game layout, not a claim that a survey found no real buildings there.

Arrange original cabins in small clusters along the southern road corridor, near shared docks and a gathering spot. Cabins can sit on suitable land toward the water or upslope from the road; do not put plots on the carriageway or scatter them around the whole lake. Confirm exact clearings and access against imported elevation before assigning permanent plot coordinates. Keep the shared dock, workshop and trophy activity on the inhabited southern side. Fictional additions must remain a separate layer. Start with flat animated water, a fixed pleasant time of day, static terrain and simple colliders. Real buildings are excluded from imports. Real businesses and infrastructure are not presented as participants in the game.

Targets: any starting cabin reaches a shared activity within about 30 seconds of normal travel; most social action stays within a few minutes' walk. If real distances are too large, restrict the playable sector first. Nonuniform distortion of the lake is outside this baseline; any later scale compression must be explicit and documented.

## 5. First visit and identity

1. Open the community invite link. Load the world and show progress with a retry path for errors.
2. The server creates or restores a player identity and assigns an available cabin atomically.
3. Spawn outside that cabin with a generated appearance and placeholder name.
4. Show “Your place. Make yourself at home.” and the cabin number. Show small contextual movement hints.
5. Let the player move immediately. Name entry and personalization are optional actions after entry.

No registration, character selection, cabin selection or tutorial gates. A browser-held return credential restores ownership on that browser. The pause menu offers a recovery code that can be saved voluntarily and used on another device. Explain that clearing browser data without keeping the code loses automatic access; owner-assisted recovery must verify the member through the existing community. No email service is required.

One identity has one active avatar. A second tab offers a session takeover instead of duplicating the player or cabin. Pending connection failures must not allocate multiple cabins. A failed ownership save must not be presented as success.

## 6. Core actions

| Action | Default control | Behavior |
| --- | --- | --- |
| Move | WASD / arrow keys | Local responsive movement with collision |
| Look | Mouse | Third-person follow camera; Esc releases capture |
| Jump | Space | Small traversable obstacles |
| Sprint | Shift | Disabled while carrying the trophy |
| Interact | E | Contextual pick up, place, fish, inspect or enter |
| Punch | Left mouse button | Only when the game has input focus |
| Drop | Q | Place carried contested object at a valid nearby point |
| Chat | Enter | Open/send chat; typing disables game controls |
| Pause | Esc | Settings, help, recovery code, leave |

The camera and input model must be tested with the reused controller before final bindings ship. Menus never cause accidental punches. Reduced-motion, sound level/mute and visible interaction feedback are included. Essential status cannot be conveyed only by audio or color.

## 7. First-release gameplay

### 7.1 Persistent cabins

Each player receives a plot, a stable seeded cabin variation, a few starter props and one odd decorative object. Variations are cosmetic and have equivalent access to shared activities. Reloading does not reroll a cabin.

The first personalization is deliberately small: optional cabin sign/name, a few paint choices, and four fixed display sockets for belongings. These actions live at the cabin or in an optional arrange menu after arrival. Full freeform furnishing, construction and collaborative editing are later features.

Cabin interiors and their immediate safe entry volumes prevent punching and theft. Other players request entry and the cabin owner approves or declines. The community administrator may enter every cabin through an explicitly authenticated server role. Client-held flags never confer administrator authority. Only the owner changes their cabin. Personal belongings cannot be stolen, deleted or converted into contested cargo.

### 7.2 Magnet fishing

Use a few marked dock positions. Interact to cast, wait for a bite window, then use one timing action to retrieve a result. The rope is visual; there is no simulated underwater rope or debris physics.

The server issues the attempt and timing window and awards the result once. Leaving range, getting stunned or disconnecting cancels an unfinished attempt. A collectible already awarded stays owned. Multiple players can fish together; use per-player cooldowns rather than making one player block an entire dock.

Start with about 12 collectible definitions, with common and uncommon variants. Finds are strange lake objects suitable for display, not a currency grind. Store stack counts for duplicates. Send finds to the player's collection so a full display cannot destroy a reward. Choosing a display socket is optional after the catch.

### 7.3 The trophy

One unmistakably ugly, desirable trophy exists in the world. It starts on a neutral plinth. Anyone eligible for competitive play can pick it up and carry it to their own outdoor plinth.

- One carrier at a time. Pickups and placements are decided by the server.
- Carrying disables sprinting and punching. The carrier can still walk, jump and drop.
- A map/nameplate indicator makes the carrier discoverable.
- A successful incoming punch drops it at a valid position.
- Place it on your plinth and keep it there for 60 seconds to earn a capture.
- It remains stealable during the countdown. Removing it cancels that countdown.
- After a capture, return it to the neutral plinth after a short presentation so the same unattended placement cannot repeatedly score.
- Disconnecting drops carried cargo immediately at the last valid position. Deep water, invalid terrain or a server restart returns the trophy to its neutral plinth.
- Trophy and plinth interaction points stay outside cabin safe volumes; the safe interior cannot be used to hide it.

Score is a simple capture count; there is no ranked season or reward economy. Contested ownership is temporary and distinct from personal item ownership.

### 7.4 Punching

| Parameter | Initial value |
| --- | --- |
| Wind-up | 0.2 seconds |
| Reach | 1.5 world meters |
| Total cooldown between attacks | 1.2 seconds |
| Stun on valid hit | **2.0 seconds** |
| Stun immunity after recovery | 3.0 seconds |
| Targets per punch | At most one |

A frontal hit produces an animation, modest visual knockback, a stun indicator and a contested-object drop. No health, death, equipment damage or loss of owned collectibles. Server checks timing, distance, facing, blocking geometry, safe volumes and immunity; clients cannot submit arbitrary successful hits.

An immunity-protected player cannot be stun-locked, knocked back or forced to drop again. A missed punch still consumes the cooldown. A stunned player cannot move, fish, pick up or attack; chat and pause remain usable. Stun and immunity expire by server timestamps, including across reconnects.

An optional peaceful state is available after entry. It prevents attacking, being attacked, and carrying or interacting with contested items. Entering peaceful state drops cargo and has a short transition delay; it cannot instantly cancel a hit or stun. Feedback clearly distinguishes a protected target from a missed hit.

### 7.5 Lake edges and chat

In v1, falling into deep water gives a splash and a quick return to the nearest valid shore recovery point. Drop/reset the trophy as above. Swimming, diving and boats are later features.

Include global text chat, readable player names, mute, and a small online roster. Keep a short in-memory chat buffer; full transcripts are not persistent game progress. Add basic message length/rate limits and owner kick/ban controls. The owner is a separately provisioned role, never selected by an ordinary client message.

## 8. Later releases

In order of likely usefulness: salvage deliveries and cooperative carrying; a dock obstacle course; occasional wash-up events; richer cabin decoration; deeper collections and trading; swimming and boats if the base game warrants them.

Do not schedule all of these into v1. AI NPCs, realistic vehicles, shared rigid-body physics, realistic hydrology, seamless large-world streaming and full reproduction of real houses are outside the first release.

## 9. Persistence and interruption rules

Persist identity, cabin allocation/seed, chosen name/colors, collection, display sockets and capture count. A successful permanent change must be committed before it is acknowledged as saved. Repeated or replayed requests cannot duplicate a reward or allocate the same plot twice.

Keep ordinary live poses transient, restoring active connection state through hibernation and taking fresh snapshots on reconnect. A full server restart may respawn players safely outside their cabin and reset the contested trophy; it must preserve personal ownership and completed rewards. If a request was interrupted after commit, the reconnect snapshot resolves its outcome.

## 10. Success and acceptance

### Experience

- Five invited testers can move and find an activity within their first minute without a spoken tutorial.
- Six friends can complete a fishing attempt, visit another cabin and produce a trophy chase in a 20-minute test.
- Returning on the same browser restores the correct cabin and belongings. Recovery on a second device works when the code is supplied.
- All cabin plots occupy the selected southern road corridor; the north shore reads as uninterrupted forest rather than a second settlement.
- At least two-thirds of a small initial playtest group voluntarily return for another session. This is a proposed validation target, not existing research evidence.

### Correctness

- Thirty active players can connect; a 31st receives the documented response.
- Concurrent join/retry, pickup and reward requests cannot duplicate cabins, trophy carriers or rewards.
- Two-second stun, cooldowns, recovery immunity, safe areas and peaceful state behave consistently for all clients.
- Stolen trophy behavior survives disconnect, water recovery and reconnect without becoming unreachable.
- No player can edit another's cabin or impersonate them by changing a player ID.
- Client hibernation/wake and server redeploy tests preserve committed player progress.

### Performance and cost

Target at least 30 fps at 1080p on a representative community laptop with 30 visible avatars, with a 60 fps aim on stronger devices. Record the hardware and scene used; no benchmark has run yet.

Aim for a first playable download under 20 MB compressed, lazy-loading cosmetic extras. Test a 30-client moving session for at least 30 minutes and measure CPU, message volume, bandwidth and persistence traffic. Start on free hosting; see the technical cost model for its daily limits.

## 11. Delivery sequence

1. **Foundation spike:** imported shoreline/roads, a terrain blockout, reused character movement and two networked browsers. Confirm controller, animation and deployment compatibility.
2. **Fun test:** carrying, punch/stun/immunity, safe volumes, and the trophy loop. Use temporary cabins and props.
3. **First community release:** persistent cabins/identity, recovery, fishing/collection, four display sockets, chat, coherent art/audio and 30-player validation.
4. **Expansion:** add one activity at a time based on actual sessions.

Phases 1 and 2 are playable development milestones. Phase 3 is the v1 described here.


## Navigation and entry progression, confirmed 28 October 2026

The current local home preview stores a stable home plot in this browser, displays a restrained floating home label/porch light, and shows that home beside the live directional cursor on a north-up minimap. This is a navigation prototype, not an allocation service. Six coherent cabin models are distributed in a stable shuffled layout; their visible number plates attach to author-defined porch posts or facade surfaces.

The next construction step is actual cabin interiors: an enter/exit doorway, a compact furnished room for each family, camera collision, and display space for personal catches and trophies. Model exteriors currently remain closed shells. Do not imply that doorway access or room rendering exists before it is built.

The owner confirmed that visits require owner approval. A visitor knocks/requests access, the owner accepts or declines, and an accepted invitation permits that visitor's entry. Define invitation lifetime and revocation with the multiplayer room implementation. Administrator entry is independent of owner approval and must be verified by the server against the administrator identity. A UI switch or local-storage value is not an admin authorization mechanism.

The user reassigned all sitting/bench interaction work to another agent. This navigation/cabin pass does not implement or alter that behavior.
