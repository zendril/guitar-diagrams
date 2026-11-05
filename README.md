# Guitar diagrams

An editable, print-ready connected fretboard for learning the seven relative modes of the major scale alongside five overlapping CAGED regions.

Live site: [zendril.github.io/guitar-diagrams](https://zendril.github.io/guitar-diagrams/)

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
