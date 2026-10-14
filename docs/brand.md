# Deckle brand assets

The mark is a lowercase typewriter d on an ivory sheet with torn edges. A rust-colored roller beneath the letter connects it to the writing machine. The background is dark ink green, matching the desk controls.

The source artwork is `public/brand/deckle.png`, generated with the built-in imagegen tool. Browser and install files are deterministic PNG/ICO size exports of that artwork.

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
