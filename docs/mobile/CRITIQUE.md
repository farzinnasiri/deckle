# Mobile layout review

The review used the running Next.js application and its actual controls. This is a self-review, not an independent agent review. The requested retro materials and existing behavior took precedence over changing palettes, adding native platform skins, or producing store assets. Existing assets supplied every texture and object; no image-generation credits were used.

## First rendered pass

The compact machine and larger paper established the chosen arrangement. Inspection found a decorative faceplate intercepting the Tools close key, the closed Notes sheet remaining visible after its parent stopped moving offscreen, and its old rotated handle conflicting with the new shelf. Those were corrected together. A later functional check caught an input race: mobile Notes became visible before its delayed React state removed `inert`. Text intended for Notes could therefore enter the paper. Mobile opening now enables and focuses Notes synchronously within the tap. Global paper shortcuts and keystroke sounds also exclude text areas.

The smaller Tools view packed its identity and counters into one row. Ghostwriter's old two-row action grid reserved an empty row while Undo was hidden; mobile now uses one action row. All changes retain the existing control materials.

## Final rendered pass

| Area | Score out of 5 | Evidence |
| --- | --- | --- |
| Concept and hierarchy | 4 | The sheet owns the resting view; three tactile actions form one short machine row. |
| Materials and color | 4 | Existing wood, cotton, metal, key faces, leather Notes tab, and restrained filing mark remain. |
| Type and copy | 4 | The installed paper face and engraved control language remain; new labels are Tools, File, Desk, and Done. |
| Layout and spacing | 4 | The paper window grows from 253 to 566 pixels at 390 × 844; Notes and Archive no longer overlap the machine. |
| Finish | 4 | The rail, print head, machine keys, shelf, and opened trays share the existing physical detail. |
| Mobile interaction | 4 | Controls appear in separate trays; keyboard mode has a Done key and uses the visible viewport. |
| Signature and behavior | 4 | The existing moving paper, carriage, sound, filing, and two-pass Ghostwriter are retained. |
| Fidelity | 4 | Existing settings, sharing/copy, Focus, sound, light, activity, archive, and Notes remain reachable. Desktop retains its direct controls. |

Resting, Tools, Desk, Settings, Notes, Ghostwriter controls/review, keyboard, small-phone, touch-landscape, and desktop screenshots are under `output/playwright/mobile/r2-*.png`. `before.png` records the old mobile view. `before-after.html` compares the actual rendered states.

## Verification

All 140 automated tests, TypeScript, formatting, `git diff --check`, and the production build passed. Signed-in browser fixtures checked formatting, model-reference navigation, selected-only Ghostwriter application and one-step Undo, filing into the archive, and widths from 320 through 1800 pixels without horizontal overflow. Final browser checks confirmed mute/unmute, the room switch, activity drawer fit, Focus/return, Notes typing and paste isolation, Notes persistence across reload, contained Notes keyboard focus, Settings, and review fit.

Keyboard checks covered a 390 × 480 layout resize and a simulated visual viewport reduced to 480 pixels inside a 390 × 844 browser. Both kept the machine at y=350 with a 106px height. The visible paper retained 346 pixels. Tools also fit above the simulated keyboard. A touch-capable 844 × 390 landscape viewport fit without overflow. The editor's source text was preserved across the changes. These are browser simulations, not real iOS or Android keyboard tests. Safari keyboard animation, safe areas on hardware, and touch feel still need a real device.

The Notes regression was reproduced before the fix, then rerun successfully: Notes received both pasted and normally typed text, the main paper remained unchanged, and Notes reloaded with its own content. The failure and successful trace are documented in the working browser-check scripts; no debug logging remains in application code.

Full walkthrough testing of the optional guided setup, every saved machine finish, every archive gesture, and every sharing provider was outside this layout pass. Their existing implementations and data contracts remain; setup can still expose the physical controls instead of a closed tray.
