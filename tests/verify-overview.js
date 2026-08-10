"use strict";

const assert = require("node:assert/strict");
const data = require("../src/diagram-data.js");
const renderer = require("../src/render.js");

const occurrences = (markup, needle) => (markup.match(new RegExp(needle, "g")) || []).length;
const ionian = data.modes.find((mode) => mode.id === "g-ionian");
const dorian = data.modes.find((mode) => mode.id === "a-dorian");
const overviewFrets = data.positionFamilies.flatMap((family) => family.scaleFretsByString.flat());
const overviewMinFret = Math.min(...overviewFrets);
const overviewMaxFret = Math.max(...overviewFrets);

const overviewPhysicalEntries = (mode) => data.strings.flatMap((string, stringIndex) => {
  const entries = [];
  for (let fret = overviewMinFret; fret <= overviewMaxFret; fret += 1) {
    const pc = (string.openPitchClass + fret) % 12;
    if (!data.parentScale.pitchClasses.includes(pc)) continue;
    entries.push({ string, stringIndex, fret, pc, tone: renderer.toneFor(mode, pc) });
  }
  return entries;
});

const positionEntries = (mode, position) => {
  if (position === "all") return overviewPhysicalEntries(mode);
  const family = data.positionFamilies.find((candidate) => candidate.position === position);
  return family.scaleFretsByString.flatMap((frets, stringIndex) => frets.map((fret) => {
    const string = data.strings[stringIndex];
    const pc = (string.openPitchClass + fret) % 12;
    return { string, stringIndex, fret, pc, tone: renderer.toneFor(mode, pc) };
  }));
};

const cagedSitesFor = (position) => {
  const families = position === "all"
    ? data.positionFamilies
    : data.positionFamilies.filter((family) => family.position === position);
  const sites = new Map();
  for (const family of families) {
    family.chordFretsByString.forEach((frets, stringIndex) => frets.forEach((fret) => {
      const key = `${stringIndex}:${fret}`;
      if (!sites.has(key)) sites.set(key, new Set());
      sites.get(key).add(family.cagedForm);
    }));
  }
  return sites;
};

const noteGroups = (markup) => [...markup.matchAll(/<g class="overview-note(?: [^"]*)?"[^>]*>[\s\S]*?<\/g>/g)]
  .map((match) => match[0]);

const noteGroupKey = (group) => {
  const match = group.match(/<title>String (\d+), fret (\d+),/);
  assert(match, "Every overview note group must identify its string and fret");
  return `${Number(match[1]) - 1}:${match[2]}`;
};

const noteGroupDegree = (group) => {
  const match = group.match(/<text class="overview-degree"[^>]*>([^<]+)<\/text>/);
  assert(match, "Every overview note group must display an interval");
  return match[1];
};

const parentChordDegreeByPitchClass = new Map([
  [data.parentScale.pitchClasses[0], "1"],
  [data.parentScale.pitchClasses[2], "3"],
  [data.parentScale.pitchClasses[4], "5"]
]);

const expectedOverviewNotes = overviewPhysicalEntries(ionian).length;
assert.equal(expectedOverviewNotes, 51, "Frets 2–15 must contain 51 physical G-major note occurrences");

const overviewPositions = ["all", 1, 2, 3, 4, 5];
const overviewOverlays = ["none", "pentatonic", "characteristic", "triad", "seventh", "caged"];
const overviewExportStems = new Set();
let overviewCombinationCount = 0;

for (const selectedMode of data.modes) {
  const physicalEntries = overviewPhysicalEntries(selectedMode);
  const expectedRoots = physicalEntries.filter((entry) => entry.pc === selectedMode.tonicPitchClass).length;

  for (const position of overviewPositions) {
    const selectedFamily = position === "all"
      ? null
      : data.positionFamilies.find((family) => family.position === position);
    const scopedEntries = positionEntries(selectedMode, position);
    const scopedKeys = new Set(scopedEntries.map((entry) => `${entry.stringIndex}:${entry.fret}`));

    for (const overlay of overviewOverlays) {
      overviewCombinationCount += 1;
      overviewExportStems.add(renderer.overviewFileStem(data, selectedMode.id, position, overlay));
      const overview = renderer.renderOverviewSvg(data, { mode: selectedMode.id, position, overlay });
      const overviewSvgTag = overview.match(/^<svg[^>]+>/)[0];
      const effectiveView = overlay === "pentatonic" ? "pentatonic" : "combined";
      const groups = noteGroups(overview);
      const openingTags = groups.map((group) => group.match(/^<g[^>]+>/)[0]);
      const insideGroups = groups.filter((group) => group.includes('data-inside-position="true"'));

      assert(overview.startsWith("<svg"), `${selectedMode.name} P${position}/${overlay} overview must be SVG`);
      assert(!overview.includes("undefined"), `${selectedMode.name} P${position}/${overlay} overview contains undefined`);
      assert(!overview.includes("NaN"), `${selectedMode.name} P${position}/${overlay} overview contains NaN`);
      assert(overviewSvgTag.includes(`data-mode="${selectedMode.id}"`), `${selectedMode.name} must expose the selected mode independently`);
      assert(overviewSvgTag.includes(`data-position="${position}"`), `${selectedMode.name} must expose position ${position} independently`);
      assert(overviewSvgTag.includes(`data-overlay="${overlay}" data-view="${effectiveView}"`), `${selectedMode.name} P${position} must expose its overlay and note view`);
      assert(overviewSvgTag.includes(`data-fret-min="${overviewMinFret}" data-fret-max="${overviewMaxFret}"`), "Overview must expose its complete fret range");
      assert.equal(occurrences(overview, 'data-position-family="'), 5, "Overview must always contain five physical position-family contours");
      assert.equal(occurrences(overview, 'data-position-anchor="'), 5, "Overview must label five physical positions rather than seven mode assignments");
      assert.equal(occurrences(overview, 'data-active-position="'), position === "all" ? 0 : 1, "Only a selected physical position may draw an active contour");
      if (selectedFamily) {
        assert(overview.includes(`data-active-position="${position}" data-caged-form="${selectedFamily.cagedForm}"`), `P${position} must activate its ${selectedFamily.cagedForm}-form contour`);
      }
      assert.equal(groups.length, expectedOverviewNotes, "Every physical parent-scale note must render exactly once");
      assert.equal(insideGroups.length, scopedEntries.length, `${selectedMode.name} P${position} scope must use position geometry rather than the mode's original contour`);
      assert.deepEqual(new Set(insideGroups.map(noteGroupKey)), scopedKeys, `${selectedMode.name} P${position} must retain the exact mode-independent position frets`);
      assert.equal(occurrences(overview, 'data-overview-root="true"'), expectedRoots, `${selectedMode.name} must ring every tonic across the displayed fretboard regardless of position`);
      assert(overview.includes("How the boxes connect"), "Overview must carry a visible purpose label");
      assert(overview.includes('viewBox="0 0 1440 460"'), "Overview must reserve three collision-free teaching rows");
      assert(overview.includes(`${selectedMode.tonic} ${selectedMode.name} ·`), "Visible caption must identify the selected modal tonic");
      if (overlay !== "pentatonic") {
        assert(
          overview.includes(`${selectedFamily ? `P${position} ${selectedFamily.cagedForm}-form region` : "all 5 CAGED positions"}`),
          "Non-pentatonic caption must identify the physical position independently"
        );
      }

      const expectedFormula = (effectiveView === "pentatonic"
        ? selectedMode.tones.filter((tone) => tone.core)
        : selectedMode.tones).map((tone) => renderer.prettyDegree(tone.degree)).join("  ");
      assert(overview.includes(`class="overview-formula" x="1400" y="39">${expectedFormula}</text>`), `${selectedMode.name} ${effectiveView} overview must show its matching interval formula`);

      const expectedVisible = overlay === "pentatonic"
        ? scopedEntries.filter((entry) => entry.tone.core).length
        : scopedEntries.length;
      assert.equal(occurrences(overview, 'data-overview-visible-in-view="true"'), expectedVisible, `${selectedMode.name} P${position}/${overlay} must expose exactly the visible notes inside its position scope`);
      const expectedOmitted = overlay === "pentatonic"
        ? scopedEntries.filter((entry) => !entry.tone.core).length
        : 0;
      assert.equal(occurrences(overview, 'class="overview-note omitted'), expectedOmitted, `${selectedMode.name} P${position}/${overlay} must omit only scoped non-core notes`);

      const expectedCharacteristics = overlay === "characteristic"
        ? scopedEntries.filter((entry) => selectedMode.characteristicDegrees.includes(entry.tone.degree)).length
        : 0;
      assert.equal(occurrences(overview, 'data-overview-characteristic="true"'), expectedCharacteristics, `${selectedMode.name} characteristic highlights must respect position ${position}`);
      if (overlay === "characteristic") {
        const formula = selectedMode.characteristicDegrees.map(renderer.prettyDegree).join(" + ");
        const scopeCaption = selectedFamily ? `within P${position} ${selectedFamily.cagedForm}-form` : "across the displayed fretboard";
        assert(overview.includes(`${selectedMode.characteristicDegrees.length === 1 ? "Characteristic tone" : "Characteristic tones"} · ${formula} · ${scopeCaption}`), `${selectedMode.name} characteristic caption must explain its position scope`);
        assert(overview.includes(".overview-note.characteristic .overview-disc{fill:#fff;stroke:#b45309"), "Characteristic highlights must use white discs with amber edges");
      }

      const modalTonicDegrees = overlay === "triad" || overlay === "seventh"
        ? new Set(renderer.overlayFor(selectedMode, overlay).degrees)
        : new Set();
      const expectedModalTonicNotes = modalTonicDegrees.size
        ? scopedEntries.filter((entry) => modalTonicDegrees.has(entry.tone.degree)).length
        : 0;
      assert.equal(occurrences(overview, 'data-overview-modal-tonic-chord="true"'), expectedModalTonicNotes, `${selectedMode.name} ${overlay} targets must respect position ${position}`);
      const expectedAddedSevenths = overlay === "seventh"
        ? scopedEntries.filter((entry) => entry.tone.degree === selectedMode.tones[6].degree).length
        : 0;
      assert.equal(occurrences(overview, 'data-overview-added-seventh="true"'), expectedAddedSevenths, `${selectedMode.name} added sevenths must respect position ${position}`);
      if (overlay === "triad" || overlay === "seventh") {
        const formula = [...modalTonicDegrees].map(renderer.prettyDegree).join(" + ");
        const heading = renderer.overlayFor(selectedMode, overlay).heading;
        const scopeCaption = selectedFamily ? `within P${position} ${selectedFamily.cagedForm}-form` : "across the displayed fretboard";
        assert(overview.includes(`${heading} · ${formula} · ${scopeCaption}`), `${selectedMode.name} ${overlay} caption must identify its interval formula and position scope`);
        assert(overview.includes("not a single chord voicing"), `${selectedMode.name} modal tonic description must distinguish a tone map from a grip`);
      }

      const cagedSites = overlay === "caged" ? cagedSitesFor(position) : new Map();
      assert.equal(occurrences(overview, 'data-overview-caged-chord="true"'), cagedSites.size, `${selectedMode.name} P${position} must highlight the expected unique parent-major CAGED sites`);
      const cagedDegreeCounts = new Map([["1", 0], ["3", 0], ["5", 0]]);
      for (const key of cagedSites.keys()) {
        const [stringIndex, fret] = key.split(":").map(Number);
        const pc = (data.strings[stringIndex].openPitchClass + fret) % 12;
        const degree = parentChordDegreeByPitchClass.get(pc);
        cagedDegreeCounts.set(degree, cagedDegreeCounts.get(degree) + 1);
      }
      for (const [degree, count] of cagedDegreeCounts) {
        assert.equal(occurrences(overview, `data-overview-caged-degree="${degree}"`), count, `${selectedMode.name} P${position} CAGED notes must show parent degree ${degree}`);
      }
      if (overlay === "caged") {
        const renderedCagedPairs = [...overview.matchAll(/data-overview-caged-degree="([135])"[^>]*>.*?<text class="overview-degree"[^>]*>([135])<\/text>/g)];
        assert.equal(renderedCagedPairs.length, cagedSites.size, "Every unique CAGED site must visibly use its parent-major degree");
        assert(renderedCagedPairs.every((match) => match[1] === match[2]), "CAGED marker text must match its parent-major data degree");
        if (selectedFamily) {
          assert(overview.includes(`Parent-major CAGED chord · P${position} ${selectedFamily.cagedForm}-form ${data.parentScale.tonic} major · 1 + 3 + 5`), "Selected-position CAGED caption must identify its one form");
        } else {
          assert.equal(cagedSites.size, 18, "All-position CAGED view must collapse 26 voicing references to 18 physical note sites");
          assert(overview.includes("Parent-major CAGED chords · all E–D–C–A–G forms"), "All-position CAGED caption must identify all five forms");
          for (const family of data.positionFamilies) {
            assert(overview.includes(family.cagedForm), `All-position CAGED view must retain ${family.cagedForm}-form metadata`);
          }
        }
        assert(overview.includes("all other interval labels remain relative"), "CAGED description must disclose the parent/modal interval frames");
      }

      const cagedKeys = new Set(cagedSites.keys());
      const expectedDisplayedDegrees = physicalEntries.map((entry) => cagedKeys.has(`${entry.stringIndex}:${entry.fret}`)
        ? parentChordDegreeByPitchClass.get(entry.pc)
        : renderer.prettyDegree(entry.tone.degree));
      assert.deepEqual(groups.map(noteGroupDegree), expectedDisplayedDegrees, `${selectedMode.name} P${position}/${overlay} must retain modal labels except on active CAGED sites`);

      if (overlay === "pentatonic") {
        const pentatonicTags = openingTags.filter((tag) => tag.includes('data-overview-pentatonic-note="true"'));
        const insidePentatonicTags = pentatonicTags.filter((tag) => tag.includes('data-inside-position="true"'));
        const hiddenNonCoreTags = openingTags.filter((tag) => /class="overview-note [^"]*\bpentatonic-hidden\b/.test(tag));
        const coreFormula = selectedMode.tones.filter((tone) => tone.core).map((tone) => renderer.prettyDegree(tone.degree));
        assert(overviewSvgTag.includes('data-pentatonic-scope="full-neck"'), `${selectedMode.name} must identify the full-neck pentatonic scope`);
        assert.equal(pentatonicTags.length, 36, `${selectedMode.name} pentatonic must always show all 36 core occurrences, independent of position`);
        assert.equal(insidePentatonicTags.length, expectedVisible, `${selectedMode.name} pentatonic position scope must retain its exact core subset`);
        assert.equal(hiddenNonCoreTags.length, 15, `${selectedMode.name} pentatonic must hide all 15 non-core occurrences across the neck`);
        assert(overview.includes(`Pentatonic only · ${coreFormula.join(" + ")} · non-core mode tones hidden`), `${selectedMode.name} pentatonic caption must name its five-note formula`);
        assert(overview.includes(`across the displayed fretboard (frets ${overviewMinFret}–${overviewMaxFret})`), `${selectedMode.name} pentatonic caption must name the displayed range`);
        if (selectedFamily) {
          assert(overview.includes(`P${position} outline is a guide`), "Selected pentatonic position must be described only as an outline guide");
        } else {
          assert(overview.includes("all positions shown"), "All-position pentatonic scope must be described explicitly");
        }
        if (selectedMode.id === "fs-locrian") {
          assert(overview.includes("no single standard Locrian pentatonic"), "Locrian pentatonic caption must disclose its nonstandard project subset");
          assert(overview.includes("project-defined rather than a standard named pentatonic"), "Locrian pentatonic description must disclose its project-defined status");
        }
      } else {
        assert(!overviewSvgTag.includes('data-pentatonic-scope='), `${selectedMode.name} ${overlay} must not claim full-neck pentatonic scope`);
        assert.equal(occurrences(overview, 'data-overview-pentatonic-note="true"'), 0, `${selectedMode.name} ${overlay} must not tag full-neck pentatonic notes`);
      }
    }
  }
}

assert.equal(overviewCombinationCount, 7 * 6 * 6, "Overview matrix must cover seven modes, six position scopes, and six learning overlays");
assert.equal(overviewExportStems.size, overviewCombinationCount, "Every mode/position/overlay overview export must have a unique filename");
assert.equal(renderer.overviewFileStem(data, ionian.id, "all", "none"), "g-ionian-all-positions-connected-overview");
assert.equal(renderer.overviewFileStem(data, "c-lydian", 2, "caged"), "c-lydian-p2-d-form-caged-connected-overview");

const ionianP2 = renderer.renderOverviewSvg(data, { mode: ionian.id, position: 2, overlay: "none" });
const ionianP2Groups = noteGroups(ionianP2).filter((group) => group.includes('data-inside-position="true"'));
assert.deepEqual(
  ionianP2Groups.map((group) => `${noteGroupKey(group)}=${noteGroupDegree(group)}`),
  [
    "0:5=2", "0:7=3", "0:8=4",
    "1:5=6", "1:7=7", "1:8=1",
    "2:4=3", "2:5=4", "2:7=5",
    "3:4=7", "3:5=1", "3:7=2",
    "4:5=5", "4:7=6",
    "5:5=2", "5:7=3", "5:8=4"
  ],
  "G Ionian + P2 must use the D-form geometry while retaining G-relative interval labels"
);
assert.deepEqual(
  ionianP2Groups.filter((group) => group.includes('data-overview-root="true"')).map(noteGroupKey),
  ["1:8", "3:5"],
  "G Ionian + P2 must ring G at B8 and D5 rather than treating A as tonic"
);
assert(ionianP2.includes("G Ionian · P2 D-form region · intervals remain relative to G"), "Ionian P2 caption must explicitly retain G as the modal tonic");
assert(ionianP2.includes("P2 changes location, not mode · G remains 1"), "Ionian P2 learning caption must explain mode/position independence");

const dorianP2 = renderer.renderOverviewSvg(data, { mode: dorian.id, position: 2, overlay: "none" });
assert.deepEqual(
  noteGroups(dorianP2).filter((group) => group.includes('data-inside-position="true"')).map(noteGroupKey),
  ionianP2Groups.map(noteGroupKey),
  "Changing Ionian to Dorian must relabel P2 without changing its physical frets"
);
assert.notDeepEqual(
  noteGroups(dorianP2).filter((group) => group.includes('data-inside-position="true"')).map(noteGroupDegree),
  ionianP2Groups.map(noteGroupDegree),
  "Changing mode must change interval meaning inside the same physical position"
);

for (const mode of data.modes) {
  const legacy = renderer.renderOverviewSvg(data, { focusMode: mode.id, overlay: "none", view: "pentatonic" });
  const explicit = renderer.renderOverviewSvg(data, { mode: mode.id, position: mode.position, overlay: "none" });
  assert.equal(legacy, explicit, `${mode.name} legacy focusMode must map to its former position and ignore the individual-box view`);
}
assert.equal(
  renderer.renderOverviewSvg(data, { focusMode: "all", overlay: "none" }),
  renderer.renderOverviewSvg(data, { mode: ionian.id, position: "all", overlay: "none" }),
  "Legacy all-focus must migrate to G Ionian across all positions"
);

assert.equal(renderer.overviewFocusMode(data, "all"), ionian);
assert.equal(renderer.overviewFocusMode(data, "not-a-mode"), null);
assert.equal(renderer.normalizeOverviewOverlay("pentatonic"), "pentatonic");
assert.equal(renderer.normalizeOverviewOverlay("triad"), "triad");
assert.equal(renderer.normalizeOverviewOverlay("seventh"), "seventh");
assert.equal(renderer.normalizeOverviewOverlay("caged"), "caged");
assert.equal(renderer.normalizeOverviewOverlay("not-an-overlay", false), "none");
assert.equal(renderer.normalizeOverviewOverlay("not-an-overlay", true), "characteristic");
