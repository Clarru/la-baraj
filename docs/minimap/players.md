# Other players on the minimap

Nearby online players appear as small dark teal circles, distinct from the local player's directional arrow. The SVG draws these markers before cabins, fishing, the campfire, home and the local player, so important objectives remain above them. Players outside the circular map view do not accumulate on its edge; disconnected players disappear. No player names or extra map controls are displayed.

The minimap samples the existing multiplayer positions four times per second and rounds positions to half a world unit (less than one screen pixel at the current map scale). It only updates when a marker actually changes, without rerendering the 3D scene or sending new network messages. The marker fill has approximately 3.1:1 contrast against lake blue and 4.6:1 against land, with a light outline for separation.

An isolated two-player browser test confirmed that a marker follows movement and disappears on disconnect. Unit tests cover filtering, position changes, range clipping and SVG layer ordering. This is a local rendering check, not a network load test.
