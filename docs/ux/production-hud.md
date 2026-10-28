# Production world interface

The production view keeps the lake and characters in the foreground. Its default chrome is the transparent La Baraj banner, the current online count, and Menu. Everyone joins the shared world through the same public address; there is no invite control or capacity denominator in the interface.

Menu contains the player's name, assigned cabin, map, controls, a cabin camera action, and a return-to-cabin rescue. The rescue places the character outside their existing assigned cabin. It does not assign another cabin. The cabin camera action is available outside and returns to walking when the player moves or chooses Back to walking.

The map starts closed. M toggles it; its own controls expand or close it. Controls opens through ? or Menu. The native dialog contains focus while Menu or Controls is open and restores the previous focus when closed. Keyboard capture stops UI key presses before movement, activity, and door listeners. Escape closes an open panel or map before it can trigger an indoor exit. Text input retains native typing, selection, submission, and Tab behavior. Key-up events continue to clear movement keys released while a panel is open.

Nearby doors, seating, fishing, and scooters retain their contextual E/F/V prompts. Scooter driving help appears briefly after mounting, then remains available in Controls. Catch records remain browser-local. OpenStreetMap attribution is available in Menu and whenever the map is visible.

The old survey/cabin/character navigation, permanent help strip, asset inventory, coverage display, rendering footer, and texture/crowd controls are absent from the production interface. Compact development tools and authored motion, seating, foundation, fire, and rendering diagnostics are compiled behind `import.meta.env.DEV`. They are not hidden production controls. The production camera can use walking and the explicit cabin view; the development inspection modes have no production entry point.

The world art, cabin library, controls, scooter, jumping, multiplayer poses, seating authority, and shared campfire remain in place. Map samples update the UI only while the map is visible; networking continues at the existing cadence throughout play.

Validation includes production header/menu markup, denominator-free connection states, actionable recovery, keyboard isolation for nickname entry, Escape precedence, and map/help shortcuts. The release owner verifies the running production view and multiplayer through independent browser sessions.
