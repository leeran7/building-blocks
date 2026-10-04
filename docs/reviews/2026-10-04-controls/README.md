# Controls: Buttons default, a pick in training, a settings cog

iPhone 13 size (390x844 @3x, saved at half size), the mobile app on Vite dev. Before is `feature/app-flow` at 7257fc4, after is PR #233. Endless runs a guest climb on a fresh device. Training signs in a stub account and uses the level API's local fallback.

## Endless climb on a fresh device

The default was the joystick, with an ↑ arrow on the jump pad and a mute button in the corner. Now the default is Buttons, jump reads "Jump", and the corner has a settings cog.

| Before | After |
|--|--|
| <img src="before-climb.jpg" width="300" alt="Joystick layout by default; the jump pad shows an up arrow over JUMP; a speaker button under Back"> | <img src="after-climb.jpg" width="300" alt="Button row by default with JUMP on the last button; a cog under Back"> |

## The button layout's jump label

| Before | After |
|--|--|
| <img src="before-climb-buttons.jpg" width="300" alt="Button row with JMP on the jump button"> | <img src="after-climb.jpg" width="300" alt="Button row with JUMP on the jump button"> |

## The cog panel (new)

The panel has a Sound switch and, on touch devices, the layout picker. Picking Joystick swaps the controls immediately.

| Panel open | After picking Joystick |
|--|--|
| <img src="after-climb-settings.jpg" width="300" alt="Panel under the cog: Sound On, Controls with Buttons selected and Joystick"> | <img src="after-climb-joystick.jpg" width="300" alt="Joystick on the left and a JUMP pad with no arrow on the right"> |

## Training

Before, the climb started on the joystick, and the copy mixed both layouts ("Hold ← or → (or push the stick)"). Now touch players pick a layout first, the copy matches the layout they picked, and a switch on the card lets them try the other one.

| Before | After: pick step (new) | After: first goal |
|--|--|--|
| <img src="before-training.jpg" width="240" alt="Walk goal: Hold left or right (or push the stick); joystick layout with an arrow on the jump pad"> | <img src="after-pick.jpg" width="240" alt="Pick your controls card with Buttons preselected and Start training"> | <img src="after-training.jpg" width="240" alt="Walk goal: Hold left or right to walk; Try the joystick button; button row with JUMP"> |

## Vibration switch in the cog

The mobile app's run screens add a Vibration switch, which uses the same saved haptics setting as Edit profile. The web game has no haptics, so it doesn't show the switch.

| Before | After | After: switched off |
|--|--|--|
| <img src="after-climb-settings.jpg" width="240" alt="Panel with Sound and Controls"> | <img src="after-vibration.jpg" width="240" alt="Panel with Sound, Vibration On and Controls"> | <img src="after-vibration-off.jpg" width="240" alt="Vibration Off"> |

## Climb header on phones

In the Endless climb (no goal bar, no power-up active), the back and cog buttons took the first grid column and squeezed Lava Clearance into the narrow button column. Every item in the top row now has an explicit column. This is the same CSS as the HUD fix PR #230, ported here; it no-ops once the base carries it.

| Before | After | After: cog open |
|--|--|--|
| <img src="before-hud.jpg" width="300" alt="Buttons on the left, Lava Clearance crushed into a sliver on the right edge"> | <img src="after-hud.jpg" width="300" alt="Height, Lava Clearance and the buttons side by side"> | <img src="after-hud-settings.jpg" width="240" alt="Settings panel hanging from the cog on the right"> |
