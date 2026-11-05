"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const data = require("../src/diagram-data.js");
const renderer = require("../src/render.js");

const occurrences = (markup, needle) => markup.split(needle).length - 1;
const pitchClass = (openPitchClass, fret) => (openPitchClass + fret) % 12;

assert.equal(data.schemaVersion, 1);
assert.equal(data.sourceRevision, 6, "The four-control/top-only release must use source revision 6");
assert.equal(data.strings.length, 6);
assert.equal(data.modes.length, 7);
assert.equal(data.positionFamilies.length, 5);

const expectedMajorKeys = [
  [0, "C", ["C", "D", "E", "F", "G", "A", "B"]],
  [1, "D♭", ["D♭", "E♭", "F", "G♭", "A♭", "B♭", "C"]],
  [2, "D", ["D", "E", "F♯", "G", "A", "B", "C♯"]],
  [3, "E♭", ["E♭", "F", "G", "A♭", "B♭", "C", "D"]],
  [4, "E", ["E", "F♯", "G♯", "A", "B", "C♯", "D♯"]],
  [5, "F", ["F", "G", "A", "B♭", "C", "D", "E"]],
  [6, "F♯", ["F♯", "G♯", "A♯", "B", "C♯", "D♯", "E♯"]],
  [7, "G", ["G", "A", "B", "C", "D", "E", "F♯"]],
  [8, "A♭", ["A♭", "B♭", "C", "D♭", "E♭", "F", "G"]],
  [9, "A", ["A", "B", "C♯", "D", "E", "F♯", "G♯"]],
  [10, "B♭", ["B♭", "C", "D", "E♭", "F", "G", "A"]],
  [11, "B", ["B", "C♯", "D♯", "E", "F♯", "G♯", "A♯"]]
];
assert.deepEqual(
  data.majorKeys.map((key) => [key.pitchClass, key.tonic, key.notes]),
  expectedMajorKeys,
  "All twelve parent-major choices must retain conventional enharmonic spelling"
);

const expectedModes = [
  ["ionian", 0, "I", "Ionian"],
  ["dorian", 1, "ii", "Dorian"],
  ["phrygian", 2, "iii", "Phrygian"],
  ["lydian", 3, "IV", "Lydian"],
  ["mixolydian", 4, "V", "Mixolydian"],
  ["aeolian", 5, "vi", "Aeolian"],
  ["locrian", 6, "vii°", "Locrian"]
];
assert.deepEqual(
  data.modes.map((mode) => [renderer.modeKeyFor(mode), mode.degreeIndex, mode.numeral, mode.name]),
  expectedModes,
  "Mode identities must be generic keys, independent of the chosen parent key"
);
assert.equal(new Set(data.modes.map(renderer.modeKeyFor)).size, 7, "Generic mode keys must be unique");

assert.deepEqual(
  data.positionFamilies.map((family) => [family.position, family.cagedForm]),
  [[1, "E"], [2, "D"], [3, "C"], [4, "A"], [5, "G"]],
  "The five physical position labels must remain P1–P5 / E–D–C–A–G"
);

const expectedPositionScaleFrets = [
  [[2, 3, 5], [3, 5], [2, 4, 5], [2, 4, 5], [2, 3, 5], [3, 5]],
  [[5, 7, 8], [5, 7, 8], [4, 5, 7], [4, 5, 7], [5, 7], [5, 7, 8]],
  [[7, 8, 10], [7, 8, 10], [7, 9], [7, 9, 10], [7, 9, 10], [7, 8, 10]],
  [[10, 12], [10, 12, 13], [9, 11, 12], [9, 10, 12], [9, 10, 12], [10, 12]],
  [[12, 14, 15], [12, 13, 15], [11, 12, 14], [12, 14], [12, 14, 15], [12, 14, 15]]
];
const expectedCagedFrets = [
  [[3], [3], [4], [5], [5], [3]],
  [[7], [8], [7], [5], [], []],
  [[7], [8], [7], [9], [10], []],
  [[10], [12], [12], [12], [10], []],
  [[15], [12], [12], [12], [14], [15]]
];
assert.deepEqual(data.positionFamilies.map((family) => family.scaleFretsByString), expectedPositionScaleFrets);
assert.deepEqual(data.positionFamilies.map((family) => family.chordFretsByString), expectedCagedFrets);

const referenceParentPitchClasses = new Set(data.parentScale.pitchClasses);
const referenceChordPitchClasses = new Set([
  data.parentScale.pitchClasses[0],
  data.parentScale.pitchClasses[2],
  data.parentScale.pitchClasses[4]
]);
for (const family of data.positionFamilies) {
  assert.equal(family.scaleFretsByString.length, 6, `P${family.position} must cover six strings`);
  assert.equal(family.chordFretsByString.length, 6, `P${family.position} chord must cover six string slots`);
  const seenPitchClasses = new Set();
  family.scaleFretsByString.forEach((frets, stringIndex) => {
    assert(frets.length > 0, `P${family.position} string ${stringIndex + 1} must contain scale notes`);
    frets.forEach((fret) => {
      const pc = pitchClass(data.strings[stringIndex].openPitchClass, fret);
      assert(referenceParentPitchClasses.has(pc), `P${family.position} fret ${fret} must stay in the reference parent scale`);
      seenPitchClasses.add(pc);
    });
  });
  assert.deepEqual([...seenPitchClasses].sort((a, b) => a - b), [...referenceParentPitchClasses].sort((a, b) => a - b));
  family.chordFretsByString.forEach((frets, stringIndex) => frets.forEach((fret) => {
    const pc = pitchClass(data.strings[stringIndex].openPitchClass, fret);
    assert(referenceChordPitchClasses.has(pc), `P${family.position} ${family.cagedForm}-form must contain only parent-major chord tones`);
    assert(family.scaleFretsByString[stringIndex].includes(fret), `P${family.position} chord note must remain inside its scale contour`);
  }));
}

for (const mode of data.modes) {
  assert.equal(mode.tones.length, 7, `${mode.name} must define seven interval labels`);
  assert.equal(mode.tones.filter((tone) => tone.core).length, 5, `${mode.name} must define a five-note learning core`);
  assert.equal(new Set(mode.tones.map((tone) => tone.semitones)).size, 7, `${mode.name} interval offsets must be unique`);
  assert(mode.characteristicDegrees.length > 0, `${mode.name} must define a characteristic tone`);
  assert(mode.characteristicDegrees.every((degree) => mode.tones.some((tone) => tone.degree === degree)));
  assert.deepEqual(
    renderer.overlayFor(mode, "triad").degrees,
    [mode.tones[0], mode.tones[2], mode.tones[4]].map((tone) => tone.degree),
    `${mode.name} tonic triad must use its first, third, and fifth scale tones`
  );
  assert.deepEqual(
    renderer.overlayFor(mode, "seventh").degrees,
    [mode.tones[0], mode.tones[2], mode.tones[4], mode.tones[6]].map((tone) => tone.degree),
    `${mode.name} tonic seventh must add its seventh scale tone`
  );
}

const gContext = renderer.deriveOverviewContext(data, { parentPitchClass: 7, mode: "ionian" });
assert.deepEqual(
  gContext.modes.map((mode) => [mode.numeral, mode.tonic, mode.name, mode.anchor.fret]),
  [
    ["I", "G", "Ionian", 3],
    ["ii", "A", "Dorian", 5],
    ["iii", "B", "Phrygian", 7],
    ["IV", "C", "Lydian", 8],
    ["V", "D", "Mixolydian", 10],
    ["vi", "E", "Aeolian", 12],
    ["vii°", "F♯", "Locrian", 14]
  ],
  "The G-parent map must restore all seven distinct modal-root landmarks"
);

// Choosing an Ionian tonic selects that same major parent and transposes the G reference geometry.
for (const [pitchClassValue, expectedTonic, expectedNotes] of expectedMajorKeys) {
  const context = renderer.deriveOverviewContext(data, { tonicPitchClass: pitchClassValue, mode: "ionian" });
  const expectedRootFret = ((pitchClassValue - 4 + 12) % 12) || 12;
  const expectedShift = expectedRootFret - 3;
  assert.equal(context.parentKey.tonic, expectedTonic);
  assert.deepEqual(context.parentKey.notes, expectedNotes);
  assert.equal(context.parentRootFret, expectedRootFret);
  assert.equal(context.fretShift, expectedShift);
  assert.deepEqual(
    context.data.positionFamilies.map((family) => family.scaleFretsByString),
    expectedPositionScaleFrets.map((strings) => strings.map((frets) => frets.map((fret) => fret + expectedShift))),
    `${expectedTonic} major CAGED scale regions must transpose together`
  );
  assert.deepEqual(
    context.data.positionFamilies.map((family) => family.chordFretsByString),
    expectedCagedFrets.map((strings) => strings.map((frets) => frets.map((fret) => fret + expectedShift))),
    `${expectedTonic} major CAGED chord voicings must transpose with the scale regions`
  );
  assert.deepEqual(
    context.modes.map((mode) => mode.anchor.fret),
    [0, 2, 4, 5, 7, 9, 11].map((offset) => expectedRootFret + offset),
    `${expectedTonic} parent must expose seven correctly transposed modal anchors`
  );
  assert.deepEqual(context.modes.map((mode) => mode.tonic), expectedNotes);
  assert.deepEqual(context.modes.map((mode) => mode.tonicPitchClass), [0, 2, 4, 5, 7, 9, 11].map((offset) => (pitchClassValue + offset) % 12));
}

require("./verify-overview.js");

const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const appSource = fs.readFileSync(path.join(__dirname, "..", "src", "app.js"), "utf8");
const ids = [...indexHtml.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(ids.length, new Set(ids).size, "Every static page ID must be unique");
assert.equal(occurrences(indexHtml, 'data-page-view="'), 2, "The single HTML file must retain the map and theory pages");

for (const id of ["overview-tonic", "overview-mode", "overview-position", "overview-overlay", "overview-pentatonic-roots"]) {
  assert(indexHtml.includes(`id="${id}"`), `The connected map must include the ${id} control`);
}
assert(indexHtml.includes("Tonic / starting note"));
assert(indexHtml.includes("Mode formula"));
assert(indexHtml.includes("CAGED position focus"));
assert(indexHtml.includes("Learning highlight"));
assert(indexHtml.includes('value="pentatonic"'));
assert(indexHtml.includes('value="triad"'));
assert(indexHtml.includes('value="seventh"'));
assert(indexHtml.includes('value="caged"'));

for (const removedId of ["diagrams", "note-view", "fret-spacing", "learning-overlay", "print-all"]) {
  assert(!indexHtml.includes(`id="${removedId}"`), `The removed lower-diagram UI must not retain #${removedId}`);
}
assert(!indexHtml.includes('id="overview-parent"'), "Parent major must be derived from tonic + mode, not exposed as a contradictory fifth control");
for (const removedSourceName of ["diagramContainer", "renderDiagrams", "exportMode", "printCard", "fretSpacingControl", "noteViewControl", "learningOverlayControl"]) {
  assert(!appSource.includes(removedSourceName), `The top-only app must not retain the old ${removedSourceName} handler`);
}
assert(!appSource.includes("renderer.renderModeSvg"), "The browser app must render only the connected overview");
assert(indexHtml.includes('id="download-project"') && indexHtml.includes('id="import-project-button"'), "Project JSON actions must remain available in the top box");

assert(indexHtml.includes('src/styles.css?v=7')
  && indexHtml.includes('src/diagram-data.js?v=7')
  && indexHtml.includes('src/render.js?v=7')
  && indexHtml.includes('src/app.js?v=7'), "Every browser asset must use the revision-7 cache key");

// Saved v5 projects used a coupled mode/position setting. Keep that migration path explicit.
assert(appSource.includes('const storageKey = "guitar-diagrams-project-v2"'), "Migration must keep reading the existing local-storage key");
assert(appSource.includes("legacyOverviewFocus"), "Old overviewFocus projects must still be recognized");
assert(appSource.includes("genericModeKey(previousMode, projectModes)"), "Old tonic-prefixed mode IDs must migrate to generic mode keys");
assert(appSource.includes("overviewTonicPitchClass"), "The selected modal tonic must be persisted independently of mode");
assert(appSource.includes("referenceParentPitchClass + majorScaleOffsets[degreeIndex]"), "Legacy parent+mode settings must migrate to their derived modal tonic");
assert(appSource.includes("legacySpecificMode.tonicPitchClass"), "Legacy tonic-prefixed mode IDs must preserve their selected tonic");
assert(appSource.includes("previousModeDefinition.position"), "A legacy coupled focus must preserve its former physical position");
assert(appSource.includes("normalized.data.sourceRevision = defaultData.sourceRevision"), "Migrated projects must record the hydrated source revision");
assert(appSource.includes("degreeIndices.has(mode.degreeIndex)"), "Imported mode degree indexes must be unique");
assert(appSource.includes("delete normalized.settings.overviewFocus"), "The obsolete coupled setting must be removed after migration");
assert(appSource.includes("delete normalized.settings.overviewParentPitchClass"), "The obsolete editable parent setting must be removed after deriving the selected tonic");
assert(appSource.includes("delete normalized.settings.view")
  && appSource.includes("delete normalized.settings.overlay")
  && appSource.includes("delete normalized.settings.fretSpacing"), "Obsolete lower-card settings must be removed after migration");
assert(appSource.includes("overviewTonicControl.addEventListener"));
assert(appSource.includes("overviewModeControl.addEventListener"));
assert(appSource.includes("overviewPositionControl.addEventListener"));
assert(appSource.includes("overviewOverlayControl.addEventListener"));

console.log("Verified theory data, transposition, diagram controls, migration, and top-only architecture.");
