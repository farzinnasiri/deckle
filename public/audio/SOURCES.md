# Prototype recordings

## Page-line selector

ruling-switch.wav: "click_switch.wav", StarTowerStudio / Freesound, sound 424987, CC0 1.0 public domain. A real miniature toggle switch, recorded with a Shure PG57.

Source: https://freesound.org/people/StarTowerStudio/sounds/424987/
Recording: https://cdn.freesound.org/previews/424/424987_8533382-hq.mp3
License: https://creativecommons.org/publicdomain/zero/1.0/

Trimmed from 0.065–0.225 seconds to retain the snap and spring tail while removing idle handling noise. Mono 44.1 kHz, 16-bit WAV; 120 Hz high-pass, 6.5 kHz low-pass, 2 ms entrance and 30 ms exit fades, gain 0.76. Playback uses a quiet gain of 0.48 and slight pitch variation through the existing volume, mute and room graph. The page-line selector uses this recording instead of the paper/card sound.

strike.mp3: "Typewriter, Key", BigSoundBank, sound 2842, CC0 public domain.
Source: https://bigsoundbank.com/typewriter-key-s2842.html
Recording: https://bigsoundbank.com/UPLOAD/mp3/2842.mp3

This is a real recorded mechanism. The prototype varies playback pitch, gain and stereo position. It is not the bespoke 24-variation, layered recording library required for launch in DECKLE.md.

key.mp3 is a trimmed excerpt of strike.mp3, with leading silence removed.
bell.mp3: "Typewriter, Bell #1", Joseph SARDIN / BigSoundBank, CC0. https://bigsoundbank.com/typewriter-bell-s2844.html

drawer.mp3: excerpt of "Wooden drawer #1", Joseph SARDIN / BigSoundBank, CC0. https://bigsoundbank.com/tiroir-en-bois-1-s1267.html

tear.mp3: "Paper tear", colorsCrimsonTears / Freesound, CC0. https://freesound.org/people/colorsCrimsonTears/sounds/566199/ . Preview recording trimmed to remove leading silence.

feed.mp3: short excerpt of "typewriter_reset2.wav", Mihacappy / Freesound, CC0. https://freesound.org/people/Mihacappy/sounds/868294/ . Leading silence removed; cropped to a short mechanical carriage/feed movement.

## Strike bank and space bar (added in the sound pass)

strikes.wav + strikes.json: 36 isolated keystrokes cut from BigSoundBank's "Typewriter" #2–#8 (sounds 2835, 2836, 2838, 2840, 2841), Joseph SARDIN, a Hermes Precisa 305 typed slowly, CC0. https://bigsoundbank.com/typewriter-2-s2835.html (and neighbouring pages). Rebuild with `node scripts/audio-bank.mjs <folder with 2835.mp3 … 2841.mp3>`; the source MP3s are at https://bigsoundbank.com/UPLOAD/mp3/2835.mp3 etc. Strikes are ordered by tone (dark and full → thin and bright) so the engine can match a strike to the weight of the glyph.

space.wav: "Typewriter, space", Joseph SARDIN / BigSoundBank, sound 2843, same Hermes Precisa 305, CC0. https://bigsoundbank.com/typewriter-space-s2843.html . Trimmed and loudness-normalised.

The room is a short synthesised impulse response (lib/audio.ts), not a recording.

## Archive folder navigation

folder-slide.mp3: excerpt of "Cardboard Box Slides and Rustling", GrayJoy / Freesound, sound 344432, CC0 1.0 public domain. Free for commercial use and modification, with no attribution required.

Source: https://freesound.org/people/GrayJoy/sounds/344432/
Recording: https://cdn.freesound.org/previews/344/344432_3278936-hq.mp3
License: https://creativecommons.org/publicdomain/zero/1.0/

Cut from 2.24–2.56 seconds of the recording, converted to mono at 44.1 kHz and 128 kbps MP3. High-pass at 100 Hz and low-pass at 3.2 kHz remove handling rumble and thin rustling. Raised 15 dB, with an 8 ms entrance and 70 ms exit fade. Folder navigation uses this short cardboard friction recording; opening and returning a reading sheet retain the paper recording. Playback follows the existing volume and mute controls, with at most one new navigation voice every 120 ms.
