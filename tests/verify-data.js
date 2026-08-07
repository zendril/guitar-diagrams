"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const data = require("../src/diagram-data.js");
const renderer = require("../src/render.js");

const views = ["full", "combined", "pentatonic"];
const overlays = ["none", "characteristic", "triad", "seventh"];
const fretSpacings = ["compact", "guitar", "wide"];
const occurrences = (markup, needle) => (markup.match(new RegExp(needle, "g")) || []).length;

assert.equal(data.schemaVersion, 1);
assert.equal(data.sourceRevision, 4);
assert.equal(data.modes.length, 7);
assert.equal(data.strings.length, 6);
assert.deepEqual(
  data.positionFamilies.map((family) => [family.position, family.cagedForm]),
  [[1, "E"], [2, "D"], [3, "C"], [4, "A"], [5, "G"]],
  "The current fret range must move through the audited E-D-C-A-G parent-major forms"
);
assert.deepEqual(
  data.positionFamilies.map((family) => family.chordFretsByString),
  [
    [[3], [3], [4], [5], [5], [3]],
    [[7], [8], [7], [5], [], []],
    [[7], [8], [7], [9], [10], []],
    [[10], [12], [12], [12], [10], []],
    [[15], [12], [12], [12], [14], [15]]
  ],
  "Position families must retain the audited high-e-to-low-E parent-major CAGED voicings"
);
const parentChordPitchClasses = new Set([
  data.parentScale.pitchClasses[0],
  data.parentScale.pitchClasses[2],
  data.parentScale.pitchClasses[4]
]);
const parentChordDegreeByPitchClass = new Map([
  [data.parentScale.pitchClasses[0], "1"],
  [data.parentScale.pitchClasses[2], "3"],
  [data.parentScale.pitchClasses[4], "5"]
]);
for (const family of data.positionFamilies) {
  const familyModes = data.modes.filter((mode) => mode.position === family.position);
  for (const [stringIndex, frets] of family.chordFretsByString.entries()) {
    for (const fret of frets) {
      const pc = (data.strings[stringIndex].openPitchClass + fret) % 12;
      assert(parentChordPitchClasses.has(pc), `P${family.position} ${family.cagedForm}-form must contain only parent-major chord tones`);
      assert(familyModes.every((mode) => mode.fretsByString[stringIndex].includes(fret)), `P${family.position} chord fret must stay inside every contour assigned to its family`);
    }
  }
}

const markerGeometry = renderer.modeMarkerGeometry;
const widestDiscRadius = markerGeometry.radius
  + Math.max(markerGeometry.discStrokeWidth, markerGeometry.overlayStrokeWidth) / 2;
const tonicOuterRadius = markerGeometry.tonicRadius + markerGeometry.tonicStrokeWidth / 2;
assert(2 * widestDiscRadius < markerGeometry.stringSpacing, "Highlighted note discs must leave clearance between adjacent strings");
assert(2 * tonicOuterRadius <= markerGeometry.stringSpacing, "Tonic rings must not cross an adjacent string");

for (const mode of data.modes) {
  assert.equal(mode.tones.length, 7, `${mode.name} must contain seven modal tones`);
  assert.equal(mode.tones.filter((tone) => tone.core).length, 5, `${mode.name} must contain five pentatonic-core tones`);
  assert.equal(new Set(mode.tones.map((tone) => tone.semitones)).size, 7, `${mode.name} semitone offsets must be unique`);
  assert.equal(mode.fretsByString.length, 6, `${mode.name} must describe all six strings`);
  assert(mode.characteristicDegrees.length > 0, `${mode.name} must define characteristic tones`);
  for (const degree of mode.characteristicDegrees) {
    assert(mode.tones.some((tone) => tone.degree === degree), `${mode.name} characteristic degree ${degree} must exist in the mode`);
  }
  assert(mode.tonicChord.triadQuality, `${mode.name} must label its tonic triad`);
  assert(mode.tonicChord.seventhQuality, `${mode.name} must label its tonic seventh chord`);

  assert.deepEqual(
    renderer.overlayFor(mode, "triad").degrees,
    [mode.tones[0], mode.tones[2], mode.tones[4]].map((tone) => tone.degree),
    `${mode.name} tonic triad must use scale degrees 1, 3, and 5`
  );
  assert.deepEqual(
    renderer.overlayFor(mode, "seventh").degrees,
    [mode.tones[0], mode.tones[2], mode.tones[4], mode.tones[6]].map((tone) => tone.degree),
    `${mode.name} tonic seventh must add scale degree 7`
  );

  for (let stringIndex = 0; stringIndex < 6; stringIndex += 1) {
    const string = data.strings[stringIndex];
    for (const fret of mode.fretsByString[stringIndex]) {
      const pc = (string.openPitchClass + fret) % 12;
      assert(data.parentScale.pitchClasses.includes(pc), `${mode.name}: string ${string.number}, fret ${fret} is outside G major`);
      assert(renderer.toneFor(mode, pc), `${mode.name}: string ${string.number}, fret ${fret} has no interval label`);
    }
  }

  const anchorIndex = data.strings.findIndex((string) => string.number === mode.anchor.string);
  assert(mode.fretsByString[anchorIndex].includes(mode.anchor.fret), `${mode.name} anchor must be selected`);
  const anchorPc = (data.strings[anchorIndex].openPitchClass + mode.anchor.fret) % 12;
  assert.equal(anchorPc, mode.tonicPitchClass, `${mode.name} anchor must be its tonic`);

  const exportStems = new Set();
  for (const view of views) {
    for (const overlay of overlays) {
      const options = { view, overlay };
      const svg = renderer.renderModeSvg(data, mode, options);
      const visibleEntries = renderer.collectEntries(data, mode, view).flat();
      const overlayDegrees = new Set(renderer.overlayFor(mode, overlay).degrees);
      const highlightedEntries = visibleEntries.filter((entry) => overlayDegrees.has(entry.tone.degree));

      assert(svg.startsWith("<svg"), `${mode.name} ${view}/${overlay} export must be SVG`);
      assert(!svg.includes("undefined"), `${mode.name} ${view}/${overlay} SVG contains undefined`);
      assert(!svg.includes("NaN"), `${mode.name} ${view}/${overlay} SVG contains NaN`);
      assert(svg.includes(`data-view="${view}" data-overlay="${overlay}"`), `${mode.name} must expose its selected view and overlay`);
      assert(svg.includes(`style="fill:${mode.accent};stroke:${mode.accent}"`), `${mode.name} contour color must be embedded for portable SVG rendering`);

      const visibleFormula = (view === "pentatonic" ? mode.tones.filter((tone) => tone.core) : mode.tones)
        .map((tone) => renderer.prettyDegree(tone.degree))
        .join("  ");
      assert(svg.includes(`class="formula" x="918" y="45">${visibleFormula}</text>`), `${mode.name} ${view} SVG must show the matching formula`);
      assert(svg.includes(`class="diagram-title" x="108" y="39">${mode.name}</text>`), `${mode.name} must have a keyless visible title`);
      const subtitleMatch = svg.match(/<text class="subtitle"[^>]*>([^<]+)<\/text>/);
      assert(subtitleMatch, `${mode.name} must have a visible subtitle`);
      assert(!subtitleMatch[1].includes("G major"), `${mode.name} visible subtitle must use generic major-scale terminology`);
      if (view === "pentatonic") {
        assert(subtitleMatch[1].startsWith(renderer.pentatonicDisplayName(mode)), `${mode.name} must use a keyless pentatonic label`);
      }

      assert(!svg.includes('class="marker-label note"'), `${mode.name} must not show note names inside markers`);
      assert.equal(occurrences(svg, 'class="marker-label"'), visibleEntries.length, `${mode.name} must show one interval label per marker`);
      assert.equal(occurrences(svg, 'class="marker '), visibleEntries.length, `${mode.name} must render the expected markers`);
      assert.equal(occurrences(svg, 'data-highlighted="true"'), highlightedEntries.length, `${mode.name} ${overlay} count must match visible selected tones`);
      assert.equal(svg.includes('class="overlay-caption"'), overlay !== "none", `${mode.name} overlay caption visibility must match its setting`);
      assert(svg.includes("<title>String "), `${mode.name} must retain accessible note details`);

      if (view === "full") {
        assert.equal(occurrences(svg, 'class="marker equal'), visibleEntries.length, `${mode.name} full view must style all notes equally`);
        assert.equal(occurrences(svg, 'class="marker optional'), 0, `${mode.name} full view must not hollow modal color notes`);
      } else if (view === "combined") {
        assert.equal(occurrences(svg, 'class="marker core'), visibleEntries.filter((entry) => entry.tone.core).length, `${mode.name} combined view must identify its core`);
        assert.equal(occurrences(svg, 'class="marker optional'), visibleEntries.filter((entry) => !entry.tone.core).length, `${mode.name} combined view must identify modal color tones`);
      } else {
        assert(visibleEntries.every((entry) => entry.tone.core), `${mode.name} pentatonic view must contain only core tones`);
        assert.equal(occurrences(svg, 'class="marker optional'), 0, `${mode.name} pentatonic view must not render non-core tones`);
      }

      exportStems.add(renderer.exportFileStem(mode, view, overlay));
    }
  }
  assert.equal(exportStems.size, views.length * overlays.length, `${mode.name} view/overlay exports must have unique filenames`);

  const spacingExportStems = new Set();
  for (const fretSpacing of fretSpacings) {
    const spacingSvg = renderer.renderModeSvg(data, mode, { view: "combined", fretSpacing });
    const modeFrets = mode.fretsByString.flat();
    const geometry = renderer.modeFretGeometry(Math.min(...modeFrets), Math.max(...modeFrets), fretSpacing);
    assert(spacingSvg.includes(`data-fret-spacing="${fretSpacing}"`), `${mode.name} must expose its ${fretSpacing} fret spacing`);
    assert(geometry.minCellWidth > 2 * tonicOuterRadius, `${mode.name} ${fretSpacing} frets must keep adjacent markers apart`);
    spacingExportStems.add(renderer.exportFileStem(mode, "combined", "none", fretSpacing));
  }
  assert.equal(spacingExportStems.size, fretSpacings.length, `${mode.name} spacing exports must have unique filenames`);
}

assert.equal(renderer.normalizeView("not-a-view"), "combined");
assert.equal(renderer.normalizeOverlay("not-an-overlay"), "none");
assert.equal(renderer.normalizeFretSpacing("not-a-spacing"), "compact");

const compactGeometry = renderer.modeFretGeometry(2, 5, "compact");
const guitarGeometry = renderer.modeFretGeometry(2, 5, "guitar");
const wideGeometry = renderer.modeFretGeometry(2, 5, "wide");
assert.equal(compactGeometry.left, 180);
assert.equal(compactGeometry.right, 780);
assert(compactGeometry.widths.every((width) => Math.abs(width - 150) < 1e-9), "Compact layout must use four equal 150-unit frets");
assert.equal(wideGeometry.left, 108);
assert.equal(wideGeometry.right, 918);
assert(wideGeometry.widths.every((width) => Math.abs(width - 202.5) < 1e-9), "Wide layout must preserve the original full-card spacing");
assert(guitarGeometry.widths.every((width, index, widths) => index === 0 || width < widths[index - 1]), "Guitar-like fret widths must taper toward the bridge");
assert(Math.abs(guitarGeometry.widths[1] / guitarGeometry.widths[0] - (2 ** (-1 / 12))) < 1e-9, "Guitar-like frets must use the twelve-tone equal-temperament ratio");
assert(Math.abs(guitarGeometry.widths.reduce((sum, width) => sum + width, 0) - 600) < 1e-9, "Guitar-like layout must retain the compact overall footprint");

const phrygian = data.modes.find((mode) => mode.id === "b-phrygian");
const lydian = data.modes.find((mode) => mode.id === "c-lydian");
assert.deepEqual(phrygian.fretsByString.slice(0, 5), lydian.fretsByString.slice(0, 5), "Phrygian and Lydian must match on the upper five strings");
assert.deepEqual(phrygian.fretsByString[5], [7, 8, 10], "Phrygian must start from low-E B7");
assert.deepEqual(lydian.fretsByString[5], [8, 10], "Lydian must start from low-E C8 and exclude B7");

const dorian = data.modes.find((mode) => mode.id === "a-dorian");
assert.deepEqual(dorian.fretsByString[4], [5, 7], "Dorian A string must exclude fret 9 to match the marked contour");

const ionian = data.modes.find((mode) => mode.id === "g-ionian");
assert.deepEqual(ionian.characteristicDegrees, ["4", "7"], "Ionian uses 4 and 7 together for modal comparison");

const locrian = data.modes.find((mode) => mode.id === "fs-locrian");
assert.deepEqual(locrian.characteristicDegrees, ["b5", "b2"], "Locrian must prioritize b5 and also show b2");
assert.deepEqual(locrian.tones.filter((tone) => tone.core).map((tone) => tone.degree), ["1", "b3", "4", "b5", "b7"]);
assert.deepEqual(renderer.overlayFor(locrian, "triad").degrees, ["1", "b3", "b5"]);
assert.deepEqual(renderer.overlayFor(locrian, "seventh").degrees, ["1", "b3", "b5", "b7"]);
const locrianPentatonicSvg = renderer.renderModeSvg(data, locrian, { view: "pentatonic", overlay: "characteristic" });
assert(locrianPentatonicSvg.includes("project-defined"), "Locrian pentatonic export must disclose its project-defined subset");
assert(locrianPentatonicSvg.includes("♭2 hidden in this view"), "Locrian must disclose its hidden supporting color tone in pentatonic view");

const overviewFrets = data.modes.flatMap((mode) => mode.fretsByString.flat());
const overviewMinFret = Math.min(...overviewFrets);
const overviewMaxFret = Math.max(...overviewFrets);
const expectedOverviewNotes = data.strings.reduce((total, string) => {
  let stringNotes = 0;
  for (let fret = overviewMinFret; fret <= overviewMaxFret; fret += 1) {
    const pc = (string.openPitchClass + fret) % 12;
    if (data.parentScale.pitchClasses.includes(pc)) stringNotes += 1;
  }
  return total + stringNotes;
}, 0);

const overviewFocuses = ["all", ...data.modes.map((mode) => mode.id)];
const overviewOverlays = ["none", "characteristic", "triad", "seventh", "caged"];
const expectedModalTonicCounts = new Map([
  ["g-ionian", 7],
  ["a-dorian", 8],
  ["b-phrygian", 8],
  ["c-lydian", 7],
  ["d-mixolydian", 7],
  ["e-aeolian", 8],
  ["fs-locrian", 8]
]);
const expectedModalSeventhCounts = new Map([
  ["g-ionian", 9],
  ["a-dorian", 10],
  ["b-phrygian", 10],
  ["c-lydian", 9],
  ["d-mixolydian", 9],
  ["e-aeolian", 10],
  ["fs-locrian", 10]
]);
const overviewEntryKey = (entry) => `${entry.stringIndex}:${entry.fret}`;
for (const focusMode of overviewFocuses) {
  for (const view of views) {
    for (const overlay of overviewOverlays) {
      const overview = renderer.renderOverviewSvg(data, { focusMode, overlay, view });
      const selectedMode = data.modes.find((mode) => mode.id === focusMode);
      const effectiveOverlay = selectedMode ? overlay : "none";
      const effectiveView = selectedMode ? view : "full";
      assert(overview.startsWith("<svg"), `${focusMode} ${view}/${overlay} overview must be SVG`);
      assert(!overview.includes("undefined"), `${focusMode} ${view}/${overlay} overview contains undefined`);
      assert(!overview.includes("NaN"), `${focusMode} ${view}/${overlay} overview contains NaN`);
      assert(overview.includes(`data-focus="${focusMode}"`), `${focusMode} overview must expose its focus`);
      assert(overview.includes(`data-overlay="${effectiveOverlay}" data-view="${effectiveView}"`), `${focusMode} overview must expose its effective overlay and note view`);
      assert(overview.includes(`data-fret-min="${overviewMinFret}" data-fret-max="${overviewMaxFret}"`), "Overview must expose its complete fret range");
      assert.equal(occurrences(overview, 'data-position-family="'), 5, "Overview must contain five physical position-family contours");
      assert.equal(occurrences(overview, 'data-caged-form="'), 5, "Every position family must identify its underlying CAGED form");
      assert.equal(occurrences(overview, 'data-mode-anchor="'), 7, "Overview must label all seven modal anchors");
      assert.equal(occurrences(overview, 'data-overview-note="true"'), expectedOverviewNotes, "Every physical parent-scale note must render exactly once");
      assert(overview.includes("How the boxes connect"), "Overview must carry a visible purpose label");
      assert(overview.includes('viewBox="0 0 1440 460"'), "Overview must reserve three collision-free teaching rows");
      for (const familyMode of data.modes.filter((mode, index, modes) => modes.findIndex((candidate) => candidate.position === mode.position) === index)) {
        const expectedStroke = selectedMode ? "#9ca3af" : familyMode.accent;
        assert(overview.includes(`style="stroke:${expectedStroke}"`), `${familyMode.name} position-family contour must embed a portable stroke color`);
      }

      const formulaMode = selectedMode || data.modes.find((mode) => mode.name === "Ionian");
      const expectedFormula = (effectiveView === "pentatonic" ? formulaMode.tones.filter((tone) => tone.core) : formulaMode.tones)
        .map((tone) => renderer.prettyDegree(tone.degree)).join("  ");
      assert(overview.includes(`class="overview-formula" x="1400" y="39">${expectedFormula}</text>`), `${focusMode} ${effectiveView} overview must show its matching interval formula`);

      if (!selectedMode) {
        assert(!overview.includes("data-active-contour="), "All-position overview must use only the five family contours");
        assert.equal(occurrences(overview, 'data-overview-visible-in-view="true"'), 0, "All-position overview has no single active modal note view");
        assert.equal(occurrences(overview, 'data-overview-root="true"'), 0, "All-position overview uses the seven labeled anchor rings rather than one modal root");
        assert.equal(occurrences(overview, 'data-overview-characteristic="true"'), 0, "All-position overview must not imply one mode's characteristic tones");
        assert.equal(occurrences(overview, 'data-overview-modal-tonic-chord="true"'), 0, "All-position overview must not imply one mode's tonic chord");
        assert.equal(occurrences(overview, 'data-overview-caged-chord="true"'), 0, "All-position overview must not imply a single CAGED voicing");
        assert(overview.includes("Focus a mode to compare its learning highlights"), "All-position overview must explain why learning highlights are disabled");
        continue;
      }

      assert(overview.includes(`data-active-contour="${selectedMode.id}"`), `${selectedMode.name} must draw its exact full-scale contour`);
      assert(overview.includes(renderer.modeViewSummary(selectedMode, effectiveView)), `${selectedMode.name} must carry the individual diagram's note-view hint into the overview`);
      const fullEntries = renderer.collectEntries(data, selectedMode, "full").flat();
      const expectedVisibleKeys = new Set(renderer.collectEntries(data, selectedMode, effectiveView).flat().map(overviewEntryKey));
      const selectedFamily = data.positionFamilies.find((family) => family.position === selectedMode.position);
      if (effectiveView === "pentatonic") {
        if (overlay === "characteristic") {
          fullEntries.filter((entry) => selectedMode.characteristicDegrees.includes(entry.tone.degree)).forEach((entry) => expectedVisibleKeys.add(overviewEntryKey(entry)));
        } else if (overlay === "triad" || overlay === "seventh") {
          const degrees = new Set(renderer.overlayFor(selectedMode, overlay).degrees);
          fullEntries.filter((entry) => degrees.has(entry.tone.degree)).forEach((entry) => expectedVisibleKeys.add(overviewEntryKey(entry)));
        } else if (overlay === "caged") {
          selectedFamily.chordFretsByString.forEach((frets, stringIndex) => frets.forEach((fret) => expectedVisibleKeys.add(`${stringIndex}:${fret}`)));
        }
      }
      assert.equal(occurrences(overview, 'data-overview-visible-in-view="true"'), expectedVisibleKeys.size, `${selectedMode.name} ${effectiveView}/${overlay} must expose exactly its visible core plus overlay references`);
      assert.equal(occurrences(overview, 'class="overview-note omitted'), fullEntries.length - expectedVisibleKeys.size, `${selectedMode.name} must hide non-core notes not selected by the overlay`);

      let expectedRoots = 0;
      for (const string of data.strings) {
        for (let fret = overviewMinFret; fret <= overviewMaxFret; fret += 1) {
          if ((string.openPitchClass + fret) % 12 === selectedMode.tonicPitchClass) expectedRoots += 1;
        }
      }
      assert.equal(occurrences(overview, 'data-overview-root="true"'), expectedRoots, `${selectedMode.name} must ring every visible tonic`);
      const expectedCharacteristics = overlay === "characteristic"
        ? fullEntries.filter((entry) => selectedMode.characteristicDegrees.includes(entry.tone.degree)).length
        : 0;
      assert.equal(occurrences(overview, 'data-overview-characteristic="true"'), expectedCharacteristics, `${selectedMode.name} characteristic highlights must stay inside its contour`);
      if (overlay === "characteristic") {
        const characteristicFormula = selectedMode.characteristicDegrees.map(renderer.prettyDegree).join(" + ");
        assert(overview.includes(`${selectedMode.characteristicDegrees.length === 1 ? "Characteristic tone" : "Characteristic tones"} · ${characteristicFormula}`), `${selectedMode.name} must label its characteristic interval formula`);
        assert(overview.includes(".overview-note.characteristic .overview-disc{fill:#fff;stroke:#b45309"), "Characteristic highlights must use white discs with amber edges");
      }

      const modalTonicDegrees = overlay === "triad" || overlay === "seventh"
        ? new Set(renderer.overlayFor(selectedMode, overlay).degrees)
        : new Set();
      const expectedModalTonicNotes = modalTonicDegrees.size
        ? fullEntries.filter((entry) => modalTonicDegrees.has(entry.tone.degree)).length
        : 0;
      if (overlay === "triad") assert.equal(expectedModalTonicNotes, expectedModalTonicCounts.get(selectedMode.id), `${selectedMode.name} modal tonic triad must retain its audited target count`);
      if (overlay === "seventh") assert.equal(expectedModalTonicNotes, expectedModalSeventhCounts.get(selectedMode.id), `${selectedMode.name} modal tonic seventh must retain its audited target count`);
      assert.equal(occurrences(overview, 'data-overview-modal-tonic-chord="true"'), expectedModalTonicNotes, `${selectedMode.name} modal tonic chord highlights must stay inside its contour`);
      if (overlay === "triad" || overlay === "seventh") {
        const modalTonicFormula = [...modalTonicDegrees].map(renderer.prettyDegree).join(" + ");
        const heading = renderer.overlayFor(selectedMode, overlay).heading;
        assert(overview.includes(`${heading} · ${modalTonicFormula}`), `${selectedMode.name} ${overlay} caption must show chord quality and interval formula`);
        assert(overview.includes("not a single chord voicing"), `${selectedMode.name} modal tonic description must distinguish a tone map from a grip`);
        assert(overview.includes(`data-overview-modal-tonic-kind="${overlay}"`), `${selectedMode.name} chord targets must identify the ${overlay} overlay`);
      }
      const expectedAddedSevenths = overlay === "seventh"
        ? fullEntries.filter((entry) => entry.tone.degree === selectedMode.tones[6].degree).length
        : 0;
      assert.equal(occurrences(overview, 'data-overview-added-seventh="true"'), expectedAddedSevenths, `${selectedMode.name} must distinguish the seventh added above its tonic triad`);
      if (overlay === "seventh") assert(overview.includes(`outlined ${renderer.prettyDegree(selectedMode.tones[6].degree)} extends the triad`), `${selectedMode.name} must explain the outlined added seventh`);

      const expectedCagedNotes = overlay === "caged"
        ? selectedFamily.chordFretsByString.reduce((total, frets) => total + frets.length, 0)
        : 0;
      assert.equal(occurrences(overview, 'data-overview-caged-chord="true"'), expectedCagedNotes, `${selectedMode.name} must highlight exactly one parent-major ${selectedFamily.cagedForm}-form voicing`);
      const expectedCagedDegreeCounts = new Map([["1", 0], ["3", 0], ["5", 0]]);
      const cagedFretKeys = new Set();
      if (overlay === "caged") {
        for (const [stringIndex, frets] of selectedFamily.chordFretsByString.entries()) {
          for (const fret of frets) {
            cagedFretKeys.add(`${stringIndex}:${fret}`);
            const pc = (data.strings[stringIndex].openPitchClass + fret) % 12;
            const degree = parentChordDegreeByPitchClass.get(pc);
            expectedCagedDegreeCounts.set(degree, expectedCagedDegreeCounts.get(degree) + 1);
          }
        }
      }
      for (const [degree, expectedCount] of expectedCagedDegreeCounts) {
        assert.equal(occurrences(overview, `data-overview-caged-degree="${degree}"`), expectedCount, `${selectedMode.name} ${selectedFamily.cagedForm}-form must label its parent-major ${degree} correctly`);
      }
      const renderedCagedDegreePairs = [...overview.matchAll(/data-overview-caged-degree="([135])"[^>]*>.*?<text class="overview-degree"[^>]*>([135])<\/text>/g)];
      assert.equal(renderedCagedDegreePairs.length, expectedCagedNotes, `${selectedMode.name} must visibly render every CAGED chord degree`);
      assert(renderedCagedDegreePairs.every((match) => match[1] === match[2]), `${selectedMode.name} CAGED marker text must match its parent-major chord degree`);
      const expectedDisplayedDegrees = data.strings.flatMap((string, stringIndex) => {
        const degrees = [];
        for (let fret = overviewMinFret; fret <= overviewMaxFret; fret += 1) {
          const pc = (string.openPitchClass + fret) % 12;
          if (!data.parentScale.pitchClasses.includes(pc)) continue;
          const modalDegree = renderer.prettyDegree(renderer.toneFor(selectedMode, pc).degree);
          degrees.push(cagedFretKeys.has(`${stringIndex}:${fret}`) ? parentChordDegreeByPitchClass.get(pc) : modalDegree);
        }
        return degrees;
      });
      const renderedDisplayedDegrees = [...overview.matchAll(/<text class="overview-degree"[^>]*>([^<]+)<\/text>/g)].map((match) => match[1]);
      assert.deepEqual(renderedDisplayedDegrees, expectedDisplayedDegrees, `${selectedMode.name} must use parent degrees only on teal CAGED notes and modal degrees everywhere else`);
      if (overlay === "caged") {
        assert(overview.includes(`Parent-major CAGED chord · P${selectedMode.position} ${selectedFamily.cagedForm}-form ${data.parentScale.tonic} major · 1 + 3 + 5`), `${selectedMode.name} CAGED caption must identify its family, form, chord, and formula`);
        assert(overview.includes("all other interval labels remain relative"), `${selectedMode.name} CAGED description must disclose the two reference frames`);
      }
      for (const mode of data.modes) {
        const family = data.positionFamilies.find((candidate) => candidate.position === mode.position);
        const expectedAnchorLabel = overlay === "caged"
          ? `P${mode.position} · ${mode.name} · ${family.cagedForm}-form`
          : `P${mode.position} · ${mode.name}</text>`;
        assert(overview.includes(expectedAnchorLabel), `${mode.name} anchor must ${overlay === "caged" ? "show" : "omit"} its CAGED form in the ${overlay} view`);
      }
    }
  }
}

assert.equal(renderer.overviewFocusMode(data, "not-a-mode"), null);
assert.equal(renderer.normalizeOverviewOverlay("triad"), "triad");
assert.equal(renderer.normalizeOverviewOverlay("seventh"), "seventh");
assert.equal(renderer.normalizeOverviewOverlay("caged"), "caged");
assert.equal(renderer.normalizeOverviewOverlay("not-an-overlay", false), "none");
assert.equal(renderer.normalizeOverviewOverlay("not-an-overlay", true), "characteristic");
assert.equal(renderer.overviewFileStem(data, "all"), "relative-mode-box-overview");
assert.equal(renderer.overviewFileStem(data, "c-lydian"), "c-lydian-connected-box-overview");

const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const appSource = fs.readFileSync(path.join(__dirname, "..", "src", "app.js"), "utf8");
const ids = [...indexHtml.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(ids.length, new Set(ids).size, "Every static page ID must be unique");
assert.equal(occurrences(indexHtml, 'data-page-view="'), 2, "The single HTML file must contain two page views");
assert(indexHtml.includes('href="#map"'), "Primary navigation must link to the diagrams page");
assert(indexHtml.includes('href="#cheat-sheet"'), "Primary navigation must link to the theory cheat sheet");
assert(indexHtml.includes('id="mode-reference-body"'), "The cheat sheet must include the data-driven seven-mode reference table");
assert(indexHtml.includes('id="overview-overlay"'), "The connected overview must offer one compact position-overlay selector");
assert(indexHtml.includes('id="fret-spacing"'), "Individual boxes must offer a fret-spacing selector");
assert(indexHtml.includes('<option value="guitar">Guitar-like — tapered frets</option>'), "Fret spacing must offer a guitar-proportional comparison");
assert(indexHtml.includes('<option value="triad">Tonic triad</option>'), "The overview learning highlight must offer the modal tonic triad");
assert(indexHtml.includes('<option value="seventh">Tonic seventh chord</option>'), "The overview learning highlight must offer the modal tonic seventh chord");
assert(indexHtml.includes('value="caged"'), "The position overlay must offer parent-major CAGED chord tones");
assert(indexHtml.includes("CAGED is five overlapping fretboard regions"), "The cheat sheet must explain CAGED as a location framework");
assert(indexHtml.includes("Every mode can be played in every usable CAGED region"), "The cheat sheet must prevent fixed mode-to-CAGED assignments");
assert(appSource.includes('window.addEventListener("hashchange"'), "Page navigation must respond to browser Back and Forward");
assert.equal(occurrences(appSource, "view: project.settings.view"), 2, "On-page and downloaded overviews must receive the selected note view");
assert(appSource.includes("view: candidate.settings.view"), "Imported projects must preflight the selected overview note view");
assert(appSource.includes('normalized.settings.fretSpacing = "compact"'), "Saved projects must migrate to the compact fret layout");
assert(appSource.includes('fretSpacingControl.addEventListener("change"'), "Fret-spacing changes must rerender the individual boxes");
assert(appSource.includes("renderTheoryReference();"), "Theory reference rows must update with imported project data");

console.log("Verified the connected learning overlays, three note views, three fret layouts, seven modal boxes, and theory reference.");
