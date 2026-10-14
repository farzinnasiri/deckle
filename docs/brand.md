# Deckle brand assets

The mark is a lowercase typewriter d on an ivory sheet with torn edges. A rust-colored roller beneath the letter connects it to the writing machine. The background is dark ink green, matching the desk controls.

The source artwork is `public/brand/deckle.png`, generated with the built-in imagegen tool. Install files are deterministic PNG size exports of that artwork. The browser favicon uses a separate optical version, `public/brand/deckle-favicon.png`, with a larger letter on ivory so it remains readable at 16 pixels.

| Asset | Dimensions | Use |
| --- | --- | --- |
| `app/favicon.ico` | 16, 32, 48 px | Browser tabs and legacy favicon clients |
| `app/icon.png` | 32 px | Browser PNG icon |
| `app/apple-icon.png` | 180 px | Apple home screen and web apps |
| `public/icons/icon-192.png` | 192 px | Web app install |
| `public/icons/icon-512.png` | 512 px | Web app install |
| `public/icons/maskable-512.png` | 512 px | Android launcher masks |

The maskable export adds an opaque ink background around the artwork to keep the full paper and letter within the launcher's safe circle. The icons have square outer edges; the operating system supplies its own mask. `app/manifest.ts` defines the install name, start URL, scope, colors, and standalone display. Next.js supplies the favicon and Apple icon links through its file conventions.

## Generation prompt

Use case: logo-brand. Create the final square app icon for Deckle, a quiet vintage typewriter writing app with warm paper, cherry wood, charcoal green machinery and rust accents. Single simple bold original graphic: a warm ivory deckle-edged sheet of paper carrying one large lowercase typewriter 'd', dark forest-charcoal ink (#353a34). A short rust-red horizontal roller/underline at the foot subtly suggests a typewriter. Flat graphic, confident silhouette, restrained midcentury publishing aesthetic, no photorealism, no gradients, no shadows, no decorative speckles, no mockup, no extra words or lettering. Background full bleed solid dark forest-charcoal #353a34. Center the entire ivory paper and d mark inside central 64% of the square, leaving generous even dark background so OS circular and rounded square masks cannot clip the mark. Paper silhouette only subtly uneven torn sides, broad enough to survive favicon reduction. Letter d extremely legible and optically centered, robust dark strokes. Output one square high resolution icon artwork, no rounded outer corners (OS supplies them), no border.

## Favicon optical variant prompt

Create a favicon-specific optical version of this Deckle logo, preserving the distinctive same lowercase typewriter 'd' letter shape and warm ivory/dark ink/rust palette. This will be reduced to only 16x16 pixels. Enlarge the dark ink d to fill about 75% of the canvas width and 80% of its height, optically centered, with strong crisp edges and robust stems/counter. Flat solid warm ivory #f5efdf full-bleed square background. Omit the dark outer background and the paper outline completely for this tiny version. Omit roller knobs; retain only a simple short thick rust red underline under the d, if it fits. No texture, no gradients, no shadow, no border, no rounded exterior corners. No extra lettering. One square icon, a single beautifully legible lowercase d that remains recognizable in a tiny browser tab. Keep the d itself true to the source mark.
