# Guitar diagrams

An editable, print-ready connected fretboard for learning the seven relative modes of the major scale alongside five overlapping CAGED regions.

Live site: [zendril.github.io/guitar-diagrams](https://zendril.github.io/guitar-diagrams/)

## Circle of fifths

Choose **Circle of fifths** in the navigation, or open [circle-of-fifths.html](circle-of-fifths.html). Click a slice to select its major key: the outer ring shows major keys, the middle ring shows their relative minors, and the inner ring counts sharps or flats. The chord boxes follow circle order **IV–I–V–ii–vi–iii–vii°**, with a **M M M m m m dim** reference row above the wheel. The three neighboring relative minors are also labeled **ii–vi–iii** inside the circle. A side reference gives the shared key signature, major/minor pairs, and chords in scale order.

Use the selector or **Fourths / Fifths** buttons to change keys. With the circle focused, arrow keys move between keys; Home returns to C. All 12 slices are available, with B/C♭, F♯/G♭, and D♭/C♯ spellings selectable separately. Chord names follow the selected spelling; the wheel shows nearby conventional key spellings and explains enharmonic equivalents when needed. Selection is saved separately in this browser and in the `key` URL parameter (a sharp is URL-encoded as `%23`). No build step or network connection is required. `node tests/verify-circle-of-fifths.js` checks all 15 spellings, signatures, chord families, and circle placements; it is included in `npm test`.

Choose **Root / Chord** to sustain a single root note or a full major, minor, or diminished triad. Click a major key, its relative minor, or a chord box; chord boxes play their own harmony without changing the selected key. For example, C major sounds C–E–G, Am sounds A–C–E, and Bdim sounds B–D–F. Switching modes updates the current sound. **Mute / Unmute** stays in effect when changing notes or modes, and one volume slider controls the whole sound. **Play drone / Play chord** starts the current selection; page load and mode changes before playback stay silent. With the circle focused, **M** plays its relative minor and **Enter / Space** plays its major key. Smooth sine tones use roots in C3–B3 with chord tones voiced above; the chord mix is normalized to keep its level comparable to the root. Audio stops when leaving the page. `node tests/verify-drone-audio.js` verifies tuning, chord voicings, mode switching, mute behavior, audio cleanup, and rapid-selection/startup races.

## Chord playground

Choose **Chord playground** in the navigation, or open [chord-playground.html](chord-playground.html). This separate page combines a chord explorer with a progression player. The existing Circle of fifths page keeps its original controls and behavior.

Set a **Home key** for the Roman-numeral reference, then choose a root on the wheel or in the selector. The home key stays fixed as you try chords. The wheel's outer boxes show the key's diatonic chords; the selected root's box reflects its current variation. The middle ring offers relative minors. Choose major, minor, dominant 7, major 7, minor 7, sus4, diminished, sus2, add9, dominant 9, or minor 7♭5. The builder shows chord tones, interval formula, degree, and every chord-tone inversion. Selecting a root, variation, or inversion plays the chord; **Play chord / Stop chord**, **Mute**, and **Volume** control the sustained sound. Arrow keys move by fifths, Enter/Space plays, and M chooses a relative minor.

Type or paste a sequence; each plain chord lasts one bar of four quarter-note beats:

```text
c7 c7 c7 c7 f7 f7 c7 c7 g7 f7 c7 c7
```

The editor accepts lowercase roots, sharps/flats, whitespace, newlines, and optional `|` bar lines. Suffixes distinguish `C7` (dominant), `Cmaj7` or `CM7` (major seventh), and `Cm7` (minor seventh). Share a bar with explicit lengths, such as `Dm7:2 G7:2 | Cmaj7`; lengths are 1–4 beats and each bar must total four. Slash notation chooses a chord-tone bass, such as `C7/E` or `C9/D`. Invalid chords, incomplete bars, and non-chord bass notes are explained before playback; progressions can contain up to 256 bars.

Use **Add bar** (or a shorter length) from the builder, or click a chord tile and **Replace selected**. Presets include the original 12-bar blues, a V7 turnaround, major/minor ii–V–I, I–V–vi–IV, and a shared-bar ii–V–I. **Transpose** moves the entire progression and home key together, preserving durations, variations, and inversions. Merely changing Home key changes the reference labels.

Set **40–240 BPM**, then play, pause/resume, or stop. **Loop**, a one-bar **Count-in** on the first pass, and an optional **Metronome** support practice. Choose sustained chords, quarter-note down strums, alternating eighth-note strums, or a D–DU–UDU pop pattern. Strum patterns restart at each chord change. Bar tiles, beat dots, and current/next chord labels follow the audio. Pause to change tempo or pattern; editing the progression stops it. Sound uses synthesized sine voices with staggered notes for strums, rather than sampled guitar audio. Mute and volume affect both auditions and the player. Audio stops when leaving the page, and long timing interruptions pause playback instead of playing missed events together.

The sequence and settings save separately in this browser. Page load is silent, and no build step, external library, or network connection is required. `node tests/verify-chord-playground.js` checks chord spellings, inversions, parsing, transposition, degree references, and rhythm schedules; `node tests/verify-playground-audio.js` checks audio timing, looping, pause/resume, mute, cleanup, and startup races. Both are included in `npm test`.

## Six-box method

Choose **Six-box method** in the main navigation, or open [six-boxes.html](six-boxes.html). This separate connected map follows [Fret Science’s demonstration of Robb Cappelletto’s exercise](https://www.youtube.com/watch?v=MY1F4-id64k&t=83s): behind, straddling, and in front of an E-string root, then the same three approaches around an A-string root. The map orders the two groups by their fret locations in each key; D starts with the A-string group. Complete movable shapes near the nut are placed an octave higher when necessary to avoid negative frets.

Select any of 12 major keys, all six boxes or an individual focus, major scale / major pentatonic / major triad, and interval or note labels. The front scale shapes have three notes per string; their pentatonic and triad shapes use the lesson’s longer diagonal routes, including Keith’s additions. G-, E-, C-, and A-form regions are represented; this exercise omits the D-form and does not change the existing five CAGED regions. This view covers the original major-key routine, not the later modal variations.

Use **Next key in fifths** for the daily routine, **Export SVG** for a standalone vector diagram, or **Print / save PDF**. Selections have their own browser storage and URL parameters (`tonic`, `box`, `palette`, `labels`). The original five-box project data is untouched. No build step or network connection is needed. `node tests/verify-six-boxes.js` checks the source shapes, diagonal routes, pitch membership, root placement, and all 504 key/palette/focus/label combinations; it is included in `npm test`.

## Open the editor

Open `index.html` directly in a browser. No installation or build step is required. Use the top navigation to switch between the interactive fretboard and the printable theory cheat sheet; `index.html#cheat-sheet` opens the reference directly.

The four diagram controls answer separate questions:

- **Tonic / starting note** chooses the pitch that sounds like `1`.
- **Mode formula** chooses the intervals heard from that tonic. Together, tonic and mode determine the relative parent major scale—for example, A plus Dorian derives G major.
- **CAGED position focus** chooses one physical parent-major chord region (`P1 E-form` through `P5 G-form`) or all five.
- **Learning highlight** compares the mode's pentatonic core, characteristic tones, tonic triad, tonic seventh chord, or the parent-major CAGED voicing.

With **Pentatonic only — across neck**, an additional **Pentatonic roots** selector shows the relative **major root**, **minor root**, or **both** (the default). Blue circles mark major roots; purple squares mark minor roots throughout the displayed neck. For example, G major and E minor pentatonic share G–A–B–D–E; A Dorian's core instead pairs C major with A minor pentatonic. Switching root markers keeps the same notes, positions, and interval labels measured from the selected modal tonic. The choice is saved with the project and included in SVG exports and printing. Locrian's project-defined subset keeps its modal tonic marker because it has no standard major/minor pentatonic pair.

The diagram deliberately shows two coordinate systems at once. Seven Roman-numeral landmarks identify the relative modal roots; five P-labels identify the CAGED regions. They overlap, but do not map one-to-one. Select A + Dorian, for example, and the map derives the G-major note collection: B Phrygian and C Lydian remain separate root landmarks inside the same broad C-form region.

The editor also provides:

- interval labels measured from the selected modal tonic;
- automatic transposition of the connected map for every tonic and mode combination;
- standalone SVG export and vector printing/PDF;
- editable project JSON download/import and automatic browser saving;
- a two-sided theory cheat sheet covering CAGED, modes, tonic chords, pentatonic cores, relative versus parallel thinking, and a short practice loop.

## Regenerate the committed SVG files

```powershell
npm run export
```

## Verify the theory data and renderer

```powershell
npm test
```

## Visual convention

- Filled marker: retained in the five-note pentatonic core.
- Hollow marker: full-mode color tone outside the five-note core.
- Colored outer ring: selected modal tonic.
- Thick amber marker edge: characteristic tone selected by the active learning highlight.
- Violet marker: modal tonic-triad target.
- Violet marker with an outlined seventh: modal tonic-seventh target, shown as the tonic triad plus its added seventh.
- Teal marker: note in a parent-major CAGED reference voicing.
- Position-colored stepped contour: one physical CAGED region.

Hollow notes are not lesser or avoid notes. They complete the seven-note mode and often provide its defining color. “Pentatonic core” means a useful five-note tonic subset, not a claim that the remaining two notes should be omitted from modal playing.

The first six modes use the conventional major or minor pentatonic subset for their tonic. Locrian uses the explicitly project-defined subset `1 ♭3 4 ♭5 ♭7`; there is no single universally standard “Locrian pentatonic.”

Characteristic-tone highlights use `4 + 7` for Ionian, `6` for Dorian, `♭2` for Phrygian, `♯4` for Lydian, `♭7` for Mixolydian, `♭6` for Aeolian, and `♭5 + ♭2` for Locrian. Tonic-chord highlights use scale degrees `1–3–5` and `1–3–5–7`, including each mode's actual altered degrees and resulting chord quality.

## How CAGED relates to the modes

CAGED and modes describe different dimensions. CAGED is a physical, chord-based map of five overlapping neck regions; a mode is an interval formula heard relative to a tonic. A CAGED letter names the movable parent-major chord form inside a region, not a mode, key, or required first note. Every mode can be played through every usable CAGED region.

Moving upward through the reference geometry gives `P1 E-form → P2 D-form → P3 C-form → P4 A-form → P5 G-form`. Changing tonic or mode derives the relative parent key and transposes that complete geometry together. These P-numbers are local CAGED-region labels, not universal pentatonic box numbers and not the seven modal degrees.

The parent-major CAGED highlight and modal tonic-chord highlights answer different questions. With a G parent, A Dorian, and P1 selected, the CAGED highlight shows G-major chord tones while the tonic-triad highlight shows A-minor tones `A–C–E` as Dorian degrees `1–♭3–5`. The physical region is unchanged; the harmonic reference is different.
