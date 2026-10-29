# Away indicator

After three minutes without keyboard, pointer, wheel or touch input, other players see an AFK label above the character's name. Input removes it. The indicator does not depend on avatar movement, so using the game menu or Planes counts as activity.

Clients report input in bounded, throttled updates, including a trailing update with its idle age. Observers calculate the timeout locally, so an inactive or backgrounded tab does not need to fire a timer to become AFK. The room keeps the latest input time in the existing connection attachment and includes its age in snapshots for late joiners and reconnects; no persistent world data or extra alarm is needed. Network latency or a delayed background-tab event can affect the exact moment by a few seconds. A player on an older build does not advertise activity and won't receive an AFK label until they refresh.
