# Mobile writing workspace

## Brief

Redesign Deckle's mobile layout around writing and the software keyboard. Preserve the existing materials, fonts, lighting, mechanical paper feed, sounds, data, controls, and Ghostwriter review/apply behavior. This is the existing Next.js browser application, not a new native app. Desktop keeps its layout. The current product and the user's screenshot supply the brief; no new branding, paywall, onboarding, or store assets are in scope.

## Current app

At 390 × 844 the machine occupies 435 pixels, including a 337-pixel control face. The paper window has only 253 pixels. Five floating buttons consume the right edge, battery and lighting consume the left, and Notes overlaps the machine. The layout measures the full browser window instead of the visual viewport above the software keyboard.

Keep: every existing writing control, font and size option, ruling, ribbon, counters, light, volume, feed, filing, archive, notes, account/settings, sharing/copy, focus, battery, and two-pass Ghostwriter. Keep the model-specific machine materials and the moving paper/carriage relationship.

Lose from the resting screen: the expanded control face, five-button corner stack, and vertical Notes tab. These functions move into trays or a quiet bottom shelf; none is deleted. The battery and room-light switch remain at the top left as horizontal controls.

## Exploration

The rendered exploration is `output/playwright/mobile/explore.html`. The user's pinned visual direction takes precedence over the skill's request for unrelated palettes and fonts. Three arrangements use the same real wood, paper, lamp, and mechanical key materials.

1. Pocket machine, chosen: a large sheet above a compact rail and three mechanical actions. Tools and Desk reveal controls in separate trays. The keyboard leaves a smaller writing strip.
2. Writing folio: maximizes paper, but removes too much of the visible machine and weakens the feed behavior.
3. Top platen: clears the keyboard, but reverses the familiar paper relationship and places controls farther from the thumb.

## Layout and materials

Paper owns the screen. A short metal chassis sits beneath it. Tools, Ghostwriter, and File form one coherent row. Notes and Archive share the bottom shelf. One Desk control opens the existing settings, sharing/copy, focus, and sound. The horizontal battery pulls its counters down beneath it; the adjacent room-light switch flicks left and right. The compact lamp fits between these controls and Desk.

The paper keeps its 170px top margin across layouts and keyboard changes. Resizing changes the visible paper window, without adding blank paper above the same writing.

Reuse Courier Prime on paper, Barlow for controls, and the installed paper faces. Reuse wood textures, paper grain, aluminum or the selected model's finish, ivory/charcoal key materials, and the existing vermilion filing mark. Primary writing remains at the chosen 16–22px size; labels are 12–14px, touch targets at least 44px. The mobile page has 12px outer margins and safe-area padding. No glass or new illustration is introduced.

## Keyboard and motion

The visual viewport sets the visible workspace height. A substantial height loss while an editable field is focused identifies a software keyboard; focus alone does not. Pinch zoom does not trigger keyboard mode. Keep the current text and the editor mounted throughout. Keyboard mode keeps the paper, carriage, Tools, Ghostwriter, and Done; the desk shelf, lamp, battery, and room-light switch step away. Done blurs the editor. Tools preserve its selection. The original machine motions, typing sounds, undo, and reduced-motion behavior remain.

## Voice and content

Use Deckle's existing object names. Labels name actions without explanatory paragraphs. Keep all existing settings copy. New resting labels: Tools, File, Desk, Notes, Archive. New tray headings: Writing tools, The desk, Notes. New keyboard action: Done. Ghostwriter retains Check, Review, Use, Skip, Apply, Instant, Stop, and Undo.

## Validation

Compare resting, typing, Tools, Desk, Settings, Notes, archive, and Ghostwriter review at 390px and a small 320px phone. Check landscape and desktop regressions, source text, selection/formatting, filing, undo, and keyboard resize. Browser keyboard simulation is recorded separately from actual iOS/Android hardware testing.
