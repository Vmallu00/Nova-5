# Nova FakePixel SkyBlock Bot

Single Mineflayer 1.8.9 bot with a mobile/desktop web dashboard.

## v5 fixes
- SkyBlock NPC uses the fixed target `-25.257, 93, -1.490`.
- Hub reference is `-2.500, 70.0625, -68.000`.
- Third hotbar slot is selected automatically before NPC interaction.
- Minecraft 1.8 `use_entity` right-click packet is sent directly.
- Added dashboard buttons for Look at NPC, Right-click NPC, and Select Slot 3.
- Added camera rotate left/right/up/down controls.
- NPC pathfinder allows parkour/sprinting and does not dig.
- Schematic builder preserves legacy metadata when available.
- Added common modern-to-1.8 block-name aliases.
- Added schematic rotation: 0/90/180/270 degrees.
- Failed block placements retry up to three times.
- Fixed schematic deletion path handling.
