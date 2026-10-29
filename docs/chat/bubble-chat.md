# Temporary player chat

Enter opens the editor above the local character. Text appears live above that player for others, without a send button or stored chat history. Enter adds a line; starting a third explicit line removes the oldest, and wrapped text scrolls to show the latest two visual lines. Escape closes it immediately. Five seconds without an edit closes the editor and clears the bubble, restoring movement controls. Clicking into a menu or opening Planes also closes the editor; Enter remains available to existing buttons and forms.

The editor uses the village's parchment and forest-green palette in a rounded speech bubble and expands from 66px to at most 240px as text grows. Text and placeholder `#20352b` sit on a solid `#f3e5c9` surface: **8.41:1**, above WCAG AA's 4.5:1 requirement for normal text. A dual-color focus indicator is visible on varied scenery. The input has an accessible name and screen-reader instructions. This is a contrast and keyboard check, not a full accessibility certification.

Chat events are ephemeral: only the connection's identity and a rate bucket live on the server; message text is not stored in snapshots, the database, or chat logs. The wire format accepts at most 180 UTF-16 units and two explicit lines, permits ordinary Unicode, rejects control characters, and throttles excessive input. The client sends updates after a short 150ms debounce and independently expires messages after five seconds, including if a sender disconnects.

[FigJam cursor chat](https://help.figma.com/hc/en-us/articles/1500004414842-Send-messages-with-cursor-chat) likewise streams text and shows it for five seconds after typing stops. In La Baraj, Enter adds a line rather than clearing the message, as requested.

Verification: two isolated browser players saw text as it was typed, the newest two lines after a third Enter, and immediate Escape clearing. A five-second idle test removed both bubbles and restored WASD. Keyboard testing confirmed W and R enter text while chat is focused rather than moving or resetting the character. Short and long messages were checked at desktop sizes; mobile remains outside the current project scope. The user-confirmed tree work remains in its own draft branch and its assets are unchanged.

A local 600-frame rendering fixture with 49 nearby walkers and 50 cabins measured about 99 fps (p95 13.5ms) at 1707×960 and DPR 1.5 on the test machine. This is a single local rendering sample, not a network load test or a guarantee for other hardware.
