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
assert.equal(data.sourceRevision, 5);
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
const expectedPositionScaleFrets = [
  [[2, 3, 5], [3, 5], [2, 4, 5], [2, 4, 5], [2, 3, 5], [3, 5]],
  [[5, 7, 8], [5, 7, 8], [4, 5, 7], [4, 5, 7], [5, 7], [5, 7, 8]],
  [[7, 8, 10], [7, 8, 10], [7, 9], [7, 9, 10], [7, 9, 10], [7, 8, 10]],
  [[10, 12], [10, 12, 13], [9, 11, 12], [9, 10, 12], [9, 10, 12], [10, 12]],
  [[12, 14, 15], [12, 13, 15], [11, 12, 14], [12, 14], [12, 14, 15], [12, 14, 15]]
];
assert.deepEqual(
  data.positionFamilies.map((family) => family.scaleFretsByString),
  expectedPositionScaleFrets,
  "Position families must retain the audited mode-independent full-scale geometry"
);
assert(!data.positionFamilies[0].scaleFretsByString[5].includes(2), "P1 must preserve the marked Ionian boundary and exclude low-E fret 2 rather than unioning the Locrian contour");
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
  assert.equal(family.scaleFretsByString.length, 6, `P${family.position} must describe all six strings`);
  const scalePitchClasses = new Set();
  for (const [stringIndex, frets] of family.scaleFretsByString.entries()) {
    assert(frets.length > 0, `P${family.position} string ${stringIndex + 1} must contain scale notes`);
    for (const fret of frets) {
      const pc = (data.strings[stringIndex].openPitchClass + fret) % 12;
      assert(data.parentScale.pitchClasses.includes(pc), `P${family.position}: string ${stringIndex + 1}, fret ${fret} must stay in the parent major scale`);
      scalePitchClasses.add(pc);
    }
  }
  assert.deepEqual(
    [...scalePitchClasses].sort((a, b) => a - b),
    [...data.parentScale.pitchClasses].sort((a, b) => a - b),
    `P${family.position} must contain all seven parent-scale pitch classes`
  );
  for (const [stringIndex, frets] of family.chordFretsByString.entries()) {
    for (const fret of frets) {
      const pc = (data.strings[stringIndex].openPitchClass + fret) % 12;
      assert(parentChordPitchClasses.has(pc), `P${family.position} ${family.cagedForm}-form must contain only parent-major chord tones`);
      assert(family.scaleFretsByString[stringIndex].includes(fret), `P${family.position} chord fret must stay inside its mode-independent position geometry`);
    }
  }
}

const representativePositionModeIds = ["g-ionian", "a-dorian", "b-phrygian", "d-mixolydian", "e-aeolian"];
for (const [index, modeId] of representativePositionModeIds.entries()) {
  assert.deepEqual(
    data.positionFamilies[index].scaleFretsByString,
    data.modes.find((mode) => mode.id === modeId).fretsByString,
    `P${index + 1} must preserve its existing representative hand-marked contour`
  );
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

require("./verify-overview.js");

const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const appSource = fs.readFileSync(path.join(__dirname, "..", "src", "app.js"), "utf8");
const ids = [...indexHtml.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(ids.length, new Set(ids).size, "Every static page ID must be unique");
assert.equal(occurrences(indexHtml, 'data-page-view="'), 2, "The single HTML file must contain two page views");
assert(indexHtml.includes('href="#map"'), "Primary navigation must link to the diagrams page");
assert(indexHtml.includes('href="#cheat-sheet"'), "Primary navigation must link to the theory cheat sheet");
assert(indexHtml.includes('id="mode-reference-body"'), "The cheat sheet must include the data-driven seven-mode reference table");
assert(indexHtml.includes('id="overview-mode"'), "The connected overview must offer an independent mode/tonic selector");
assert(indexHtml.includes('id="overview-position"'), "The connected overview must offer an independent physical-position selector");
assert(indexHtml.includes('<option value="all">All 5 positions</option>'), "The position selector must offer the complete five-position scope");
assert(indexHtml.includes('id="overview-overlay"'), "The connected overview must offer a learning-highlight selector");
assert(indexHtml.includes('id="fret-spacing"'), "Individual boxes must offer a fret-spacing selector");
assert(indexHtml.includes('<option value="guitar">Guitar-like — tapered frets</option>'), "Fret spacing must offer a guitar-proportional comparison");
assert(indexHtml.includes('<option value="triad">Tonic triad</option>'), "The overview learning highlight must offer the modal tonic triad");
assert(indexHtml.includes('<option value="seventh">Tonic seventh chord</option>'), "The overview learning highlight must offer the modal tonic seventh chord");
assert(indexHtml.includes('<option value="pentatonic">Pentatonic only — across neck</option>'), "The overview learning highlight must offer the full-neck pentatonic view");
assert(indexHtml.includes('value="caged"'), "The position overlay must offer parent-major CAGED chord tones");
assert(indexHtml.includes('<legend>Individual reference boxes — notes shown</legend>'), "The lower note-view controls must distinguish the original reference boxes from the independent connected map");
assert(indexHtml.includes('src/styles.css?v=5') && indexHtml.includes('src/diagram-data.js?v=5')
  && indexHtml.includes('src/render.js?v=5') && indexHtml.includes('src/app.js?v=5'), "Revision 5 assets must use cache-busting URLs");
assert(indexHtml.includes("CAGED is five overlapping fretboard regions"), "The cheat sheet must explain CAGED as a location framework");
assert(indexHtml.includes("Every mode can be played in every usable CAGED region"), "The cheat sheet must prevent fixed mode-to-CAGED assignments");
assert(appSource.includes('window.addEventListener("hashchange"'), "Page navigation must respond to browser Back and Forward");
assert.equal(occurrences(appSource, "view: project.settings.view"), 0, "Connected overviews must not inherit the individual-box note view");
assert(!appSource.includes("view: candidate.settings.view"), "Imported projects must preflight the connected overview independently of the individual-box note view");
assert(appSource.includes('normalized.settings.fretSpacing = "compact"'), "Saved projects must migrate to the compact fret layout");
assert(appSource.includes('normalized.settings.overviewMode = legacyOverviewFocus'), "Saved projects must migrate the old focus mode into the independent mode setting");
assert(appSource.includes('normalized.settings.overviewPosition = legacyMode ? legacyMode.position : "all"'), "Saved projects must migrate the old focus contour into an independent position setting");
assert(appSource.includes('delete normalized.settings.overviewFocus'), "Saved projects must remove the obsolete coupled focus setting");
assert(appSource.includes('["none", "pentatonic", "characteristic", "triad", "seventh", "caged"].includes(candidate.settings.overviewOverlay)'), "Imported projects must accept the full-neck pentatonic overview overlay");
assert(appSource.includes('mode: candidate.settings.overviewMode') && appSource.includes('position: candidate.settings.overviewPosition'), "Imported projects must preflight mode and position independently");
assert(appSource.includes('${escapeHtml(mode.name)} · ${escapeHtml(mode.tonic)} tonic'), "Mode options must show both mode name and tonic");
assert(appSource.includes('overviewModeControl.addEventListener("change"'), "Mode changes must rerender the overview independently");
assert(appSource.includes('overviewPositionControl.addEventListener("change"'), "Position changes must rerender the overview independently");
assert(appSource.includes('fretSpacingControl.addEventListener("change"'), "Fret-spacing changes must rerender the individual boxes");
assert(appSource.includes("renderTheoryReference();"), "Theory reference rows must update with imported project data");

console.log("Verified independent mode/position overviews, all learning overlays, three note views, three fret layouts, seven reference boxes, and theory reference.");
