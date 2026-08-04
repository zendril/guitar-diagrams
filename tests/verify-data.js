"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const data = require("../src/diagram-data.js");
const renderer = require("../src/render.js");

const views = ["full", "combined", "pentatonic"];
const overlays = ["none", "characteristic", "triad", "seventh"];
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
}

assert.equal(renderer.normalizeView("not-a-view"), "combined");
assert.equal(renderer.normalizeOverlay("not-an-overlay"), "none");

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
const overviewOverlays = ["none", "characteristic", "triad", "caged"];
const expectedModalTonicCounts = new Map([
  ["g-ionian", 7],
  ["a-dorian", 8],
  ["b-phrygian", 8],
  ["c-lydian", 7],
  ["d-mixolydian", 7],
  ["e-aeolian", 8],
  ["fs-locrian", 8]
]);
for (const focusMode of overviewFocuses) {
  for (const overlay of overviewOverlays) {
    const overview = renderer.renderOverviewSvg(data, { focusMode, overlay });
    const selectedMode = data.modes.find((mode) => mode.id === focusMode);
    const effectiveOverlay = selectedMode ? overlay : "none";
    assert(overview.startsWith("<svg"), `${focusMode} overview must be SVG`);
    assert(!overview.includes("undefined"), `${focusMode} overview contains undefined`);
    assert(!overview.includes("NaN"), `${focusMode} overview contains NaN`);
    assert(overview.includes(`data-focus="${focusMode}"`), `${focusMode} overview must expose its focus`);
    assert(overview.includes(`data-overlay="${effectiveOverlay}"`), `${focusMode} overview must expose its effective position overlay`);
    assert(overview.includes(`data-fret-min="${overviewMinFret}" data-fret-max="${overviewMaxFret}"`), "Overview must expose its complete fret range");
    assert.equal(occurrences(overview, 'data-position-family="'), 5, "Overview must contain five physical position-family contours");
    assert.equal(occurrences(overview, 'data-caged-form="'), 5, "Every position family must identify its underlying CAGED form");
    assert.equal(occurrences(overview, 'data-mode-anchor="'), 7, "Overview must label all seven modal anchors");
    assert.equal(occurrences(overview, 'data-overview-note="true"'), expectedOverviewNotes, "Every physical parent-scale note must render exactly once");
    assert(overview.includes("How the boxes connect"), "Overview must carry a visible purpose label");
    for (const familyMode of data.modes.filter((mode, index, modes) => modes.findIndex((candidate) => candidate.position === mode.position) === index)) {
      const expectedStroke = selectedMode ? "#9ca3af" : familyMode.accent;
      assert(overview.includes(`style="stroke:${expectedStroke}"`), `${familyMode.name} position-family contour must embed a portable stroke color`);
    }

    if (!selectedMode) {
      assert(!overview.includes("data-active-contour="), "All-position overview must use only the five family contours");
      assert.equal(occurrences(overview, 'data-overview-root="true"'), 0, "All-position overview uses the seven labeled anchor rings rather than one modal root");
      assert.equal(occurrences(overview, 'data-overview-characteristic="true"'), 0, "All-position overview must not imply one mode's characteristic tones");
      assert.equal(occurrences(overview, 'data-overview-modal-tonic-chord="true"'), 0, "All-position overview must not imply one mode's tonic chord");
      assert.equal(occurrences(overview, 'data-overview-caged-chord="true"'), 0, "All-position overview must not imply a single CAGED voicing");
      assert.equal(occurrences(overview, 'data-overview-caged-degree="'), 0, "All-position overview must not use chord-relative marker labels");
    } else {
      assert(overview.includes(`data-active-contour="${selectedMode.id}"`), `${selectedMode.name} must draw its exact selected contour`);
      let expectedRoots = 0;
      for (const string of data.strings) {
        for (let fret = overviewMinFret; fret <= overviewMaxFret; fret += 1) {
          if ((string.openPitchClass + fret) % 12 === selectedMode.tonicPitchClass) expectedRoots += 1;
        }
      }
      assert.equal(occurrences(overview, 'data-overview-root="true"'), expectedRoots, `${selectedMode.name} must ring every visible tonic`);
      const expectedCharacteristics = overlay === "characteristic"
        ? renderer.collectEntries(data, selectedMode, "full").flat()
          .filter((entry) => selectedMode.characteristicDegrees.includes(entry.tone.degree)).length
        : 0;
      assert.equal(occurrences(overview, 'data-overview-characteristic="true"'), expectedCharacteristics, `${selectedMode.name} characteristic highlights must stay inside its contour`);
      const modalTonicDegrees = new Set(renderer.overlayFor(selectedMode, "triad").degrees);
      const expectedModalTonicNotes = overlay === "triad"
        ? renderer.collectEntries(data, selectedMode, "full").flat()
          .filter((entry) => modalTonicDegrees.has(entry.tone.degree)).length
        : 0;
      assert.equal(expectedModalTonicNotes, overlay === "triad" ? expectedModalTonicCounts.get(selectedMode.id) : 0, `${selectedMode.name} modal tonic triad must retain its audited target count`);
      assert.equal(occurrences(overview, 'data-overview-modal-tonic-chord="true"'), expectedModalTonicNotes, `${selectedMode.name} modal tonic chord highlights must stay inside its contour`);
      if (overlay === "triad") {
        const modalTonicFormula = [...modalTonicDegrees].map(renderer.prettyDegree).join(" + ");
        assert(overview.includes(`${selectedMode.tonic} ${selectedMode.tonicChord.triadQuality} tonic triad · ${modalTonicFormula} use violet fills`), `${selectedMode.name} modal tonic caption must show chord identity and formula`);
        assert(overview.includes("not a single chord voicing"), `${selectedMode.name} modal tonic description must distinguish a tone map from a grip`);
      }
      const selectedFamily = data.positionFamilies.find((family) => family.position === selectedMode.position);
      const expectedCagedNotes = overlay === "caged"
        ? selectedFamily.chordFretsByString.reduce((total, frets) => total + frets.length, 0)
        : 0;
      assert.equal(occurrences(overview, 'data-overview-caged-chord="true"'), expectedCagedNotes, `${selectedMode.name} must highlight exactly one parent-major ${selectedFamily.cagedForm}-form voicing`);
      const expectedCagedDegreeCounts = new Map([["1", 0], ["3", 0], ["5", 0]]);
      if (overlay === "caged") {
        for (const [stringIndex, frets] of selectedFamily.chordFretsByString.entries()) {
          for (const fret of frets) {
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
      const cagedFretKeys = new Set();
      if (overlay === "caged") {
        selectedFamily.chordFretsByString.forEach((frets, stringIndex) => {
          frets.forEach((fret) => cagedFretKeys.add(`${stringIndex}:${fret}`));
        });
      }
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
        assert(overview.includes(`${data.parentScale.tonic} major chord = teal 1 · 3 · 5`), `${selectedMode.name} CAGED caption must disclose its chord-relative labels`);
        assert(overview.includes(`rings mark ${selectedMode.tonic} tonic`), `${selectedMode.name} CAGED caption must identify the modal tonic rings`);
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
assert(indexHtml.includes('<option value="triad">Modal tonic chord tones</option>'), "The position overlay must offer modal tonic chord tones");
assert(indexHtml.includes('value="caged"'), "The position overlay must offer parent-major CAGED chord tones");
assert(indexHtml.includes("CAGED is five overlapping fretboard regions"), "The cheat sheet must explain CAGED as a location framework");
assert(indexHtml.includes("Every mode can be played in every usable CAGED region"), "The cheat sheet must prevent fixed mode-to-CAGED assignments");
assert(appSource.includes('window.addEventListener("hashchange"'), "Page navigation must respond to browser Back and Forward");
assert(appSource.includes("renderTheoryReference();"), "Theory reference rows must update with imported project data");

console.log("Verified the connected CAGED/modal-tonic overview, seven modal boxes, and two-view theory reference.");
