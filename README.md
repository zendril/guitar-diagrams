# Guitar diagrams

Editable, print-ready diagrams for the seven relative modes of the major scale, currently anchored to G major on the fretboard. The shapes reproduce the individual tonic-start contours marked in the reference photo, including the different low-E starts for B Phrygian and C Lydian.

Live site: [zendril.github.io/guitar-diagrams](https://zendril.github.io/guitar-diagrams/)

## Open the editor

Open `index.html` directly in a browser. No installation or build step is required. Use the top navigation to switch between the diagrams and the printable theory cheat sheet; `index.html#cheat-sheet` opens the reference directly.

The editor provides:

- a connected-position overview with five overlapping physical contours and all seven modal root anchors;
- a mode-focus control that relabels the shared fretboard from the selected tonic and emphasizes its exact contour, roots, and characteristic tones;
- a focused-position overlay that switches among modal characteristic tones, modal tonic-chord targets, and parent-major CAGED chord tones;
- one separate diagram for each mode;
- a full-scale view with all seven notes shown equally;
- a full-scale view with the pentatonic core emphasized;
- a pentatonic-only view;
- characteristic-tone, tonic-triad, and tonic-seventh learning highlights;
- three switchable fret-spacing layouts for the individual boxes: compact equal, guitar-like tapered, and full-width;
- interval-only marker labels, with note names retained in accessible descriptions;
- standalone SVG export for each box;
- one-diagram or seven-page vector printing/PDF;
- editable project JSON download/import and automatic local saving.
- a two-sided theory cheat sheet covering CAGED, modes, tonic chords, pentatonic cores, relative versus parallel thinking, and a short practice loop.

## Regenerate the committed SVG files

```powershell
npm run export
```

This writes the connected-position sheet to `exports/overview`, seven equal-note diagrams to `exports/full-scale`, seven core-emphasis diagrams to `exports/pentatonic-emphasis`, and seven five-note versions to `exports/pentatonic`.

## Verify the theory data and renderer

```powershell
npm test
```

## Visual convention

- Filled marker: retained in the five-note pentatonic core.
- Hollow marker: full-mode color tone outside the five-note core.
- Colored outer ring: tonic.
- Thick amber marker edge: note selected by the active learning highlight.
- Violet overview marker: modal tonic-triad target inside the focused contour.
- Teal overview marker: note in the selected parent-major CAGED reference voicing.
- Stepped contour: derived from the notes shown on each string.

The individual diagrams default to a centered compact fretboard so the pattern is easier to read without shrinking note markers or string spacing. “Guitar-like” keeps that compact footprint but tapers consecutive fret widths by the physical 12-tone equal-temperament ratio. “Wide” preserves the original equal-fret, full-card layout for comparison. These spacing choices change only the drawing geometry, never the notes or intervals.

The first six modes use the conventional major or minor pentatonic subset for their tonic. F♯ Locrian uses the explicitly project-defined Locrian-compatible subset `1 ♭3 4 ♭5 ♭7`, since ordinary F♯ minor pentatonic would contain C♯ rather than Locrian's C natural. There is no single universally standard “Locrian pentatonic.”

The hollow notes are not unimportant: they frequently contain the characteristic interval that makes the full mode sound modal. “Pentatonic core” means the conventional five-note tonic subset, not a claim that the remaining two notes should be avoided. In the full-scale equal view, all seven markers use the same fill.

The characteristic-tone highlight uses `4 + 7` for Ionian, `6` for Dorian, `♭2` for Phrygian, `♯4` for Lydian, `♭7` for Mixolydian, `♭6` for Aeolian, and `♭5 + ♭2` for Locrian. Chord highlights use the tonic scale degrees `1–3–5` and `1–3–5–7`, with each mode's actual altered intervals and chord quality.

A tonic triad is built by taking every other note from the tonic: scale degrees `1–3–5`. Ionian, Lydian, and Mixolydian have a major tonic triad (`1 3 5`); Dorian, Phrygian, and Aeolian have a minor tonic triad (`1 ♭3 5`); Locrian has a diminished tonic triad (`1 ♭3 ♭5`). These are useful resolution targets inside each box.

The overview intentionally shows five broad position families rather than pretending the seven modes occupy seven unrelated regions. Ionian/Locrian share position family 1, and Phrygian/Lydian share position family 3; choosing either mode reveals its exact low-E boundary while the other position families remain visible as context.

## How CAGED relates to the modal boxes

CAGED and modes describe different dimensions. CAGED is a physical, chord-based map of five overlapping neck regions; a mode is an interval formula heard relative to a tonic. A CAGED letter names the movable parent-chord form inside a region, not a mode, key, or required starting note. Every mode can be played through every usable CAGED region.

For this map, moving upward through the displayed fret range gives position family 1 through 5 as `E-form → D-form → C-form → A-form → G-form`. These are CAGED-aligned parent-major regions, not universal scale-box definitions. Five common pentatonic shapes often align with those regions, but box numbering varies between teaching systems.

The connected overview can highlight one parent-major reference voicing for the focused family: E-form `3–5–5–4–3–3`, D-form `x–x–5–7–8–7`, C-form `x–10–9–7–8–7`, A-form `x–10–12–12–12–10`, and G-form `15–14–12–12–12–15` (written low string to high string, with `x` for a muted string). The complete G- and C-form grips are often played as smaller fragments; the diagram shows their full chord-tone skeleton. In this overlay, the teal chord notes use parent-major degrees `1–3–5`; all other notes keep the selected mode's interval labels. This makes both reference frames visible without implying that the parent-major chord is every mode's tonic chord.

The modal tonic-chord overview is intentionally different: it highlights every tonic-triad pitch location inside the selected modal contour rather than one guitar voicing. For example, the parent-major CAGED overlay shows a G-major D-form voicing in the A Dorian region, while the modal tonic overlay shows the A-minor tones `A–C–E` as Dorian degrees `1–♭3–5` throughout that contour.
