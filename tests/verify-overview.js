"use strict";

const assert = require("node:assert/strict");
const data = require("../src/diagram-data.js");
const renderer = require("../src/render.js");

const tonicPitchClasses = Array.from({ length: 12 }, (_, index) => index);
const modeKeys = ["ionian", "dorian", "phrygian", "lydian", "mixolydian", "aeolian", "locrian"];
const majorScaleOffsets = [0, 2, 4, 5, 7, 9, 11];
const positions = ["all", 1, 2, 3, 4, 5];
const overlays = ["none", "pentatonic", "characteristic", "triad", "seventh", "caged"];
const occurrences = (markup, needle) => markup.split(needle).length - 1;
const pitchClass = (openPitchClass, fret) => (openPitchClass + fret) % 12;

const noteGroups = (markup) => [...markup.matchAll(/<g class="overview-note(?: [^"]*)?"[^>]*>[\s\S]*?<\/g>/g)]
  .map((match) => match[0]);

function noteGroupKey(group) {
  const match = group.match(/<title>String (\d+), fret (\d+),/);
  assert(match, "Every overview note must identify its string and fret");
  return `${match[1]}:${match[2]}`;
}

function noteGroupDegree(group) {
  const match = group.match(/<text class="overview-degree"[^>]*>([^<]+)<\/text>/);
  assert(match, "Every overview note must display an interval degree");
  return match[1];
}

function physicalEntries(context) {
  const overviewData = context.data;
  const allFrets = overviewData.positionFamilies.flatMap((family) => family.scaleFretsByString.flat());
  const minFret = Math.min(...allFrets);
  const maxFret = Math.max(...allFrets);
  const parentPcs = new Set(overviewData.parentScale.pitchClasses);
  const entries = overviewData.strings.flatMap((string, stringIndex) => {
    const stringEntries = [];
    for (let fret = minFret; fret <= maxFret; fret += 1) {
      const pc = pitchClass(string.openPitchClass, fret);
      if (!parentPcs.has(pc)) continue;
      stringEntries.push({
        string,
        stringIndex,
        fret,
        pc,
        tone: renderer.toneFor(context.selectedMode, pc)
      });
    }
    return stringEntries;
  });
  return { entries, minFret, maxFret };
}

function scopedEntries(context, position, allEntries) {
  if (position === "all") return allEntries;
  const family = context.data.positionFamilies.find((candidate) => candidate.position === position);
  return family.scaleFretsByString.flatMap((frets, stringIndex) => frets.map((fret) => {
    const string = context.data.strings[stringIndex];
    const pc = pitchClass(string.openPitchClass, fret);
    return { string, stringIndex, fret, pc, tone: renderer.toneFor(context.selectedMode, pc) };
  }));
}

function cagedSites(context, position) {
  const families = position === "all"
    ? context.data.positionFamilies
    : context.data.positionFamilies.filter((family) => family.position === position);
  const sites = new Map();
  for (const family of families) {
    family.chordFretsByString.forEach((frets, stringIndex) => frets.forEach((fret) => {
      const key = `${stringIndex}:${fret}`;
      if (!sites.has(key)) sites.set(key, new Set());
      sites.get(key).add(family.cagedForm);
    }));
  }
  return sites;
}

let combinationCount = 0;
const filenames = new Set();

for (const tonicPitchClass of tonicPitchClasses) {
  for (const mode of modeKeys) {
    const context = renderer.deriveOverviewContext(data, { tonicPitchClass, mode });
    const { entries, minFret, maxFret } = physicalEntries(context);
    const expectedRootCount = entries.filter((entry) => entry.pc === context.selectedMode.tonicPitchClass).length;
    const expectedCoreCount = entries.filter((entry) => entry.tone.core).length;
    const expectedNonCoreCount = entries.length - expectedCoreCount;

    const modeDegreeIndex = modeKeys.indexOf(mode);
    const expectedParentPitchClass = ((tonicPitchClass - majorScaleOffsets[modeDegreeIndex]) % 12 + 12) % 12;
    assert.equal(context.selectedMode.key, mode);
    assert.equal(context.selectedMode.tonicPitchClass, tonicPitchClass, "The tonic selector must remain the requested modal home note");
    assert.equal(context.parentKey.pitchClass, expectedParentPitchClass, "The relative parent must be derived from tonic + mode");
    assert.equal(context.selectedMode.tonic, context.parentKey.notes[context.selectedMode.degreeIndex]);

    for (const position of positions) {
      const selectedFamily = position === "all"
        ? null
        : context.data.positionFamilies.find((family) => family.position === position);
      const scoped = scopedEntries(context, position, entries);

      for (const overlay of overlays) {
        combinationCount += 1;
        const svg = renderer.renderOverviewSvg(data, { tonicPitchClass, mode, position, overlay });
        const svgTag = svg.match(/^<svg[^>]+>/)?.[0];
        assert(svgTag, `${context.parentKey.tonic} ${mode} P${position}/${overlay} must render an SVG`);
        assert(!svg.includes("undefined"));
        assert(!svg.includes("NaN"));
        assert(svgTag.includes(`data-parent-pitch-class="${expectedParentPitchClass}"`));
        assert(svgTag.includes(`data-mode="${mode}"`));
        assert(svgTag.includes(`data-tonic-pitch-class="${context.selectedMode.tonicPitchClass}"`));
        assert(svgTag.includes(`data-position="${position}"`));
        assert(svgTag.includes(`data-overlay="${overlay}"`));
        assert(svgTag.includes(`data-view="${overlay === "pentatonic" ? "pentatonic" : "combined"}"`));
        assert(svgTag.includes(`data-fret-min="${minFret}" data-fret-max="${maxFret}"`));

        assert.equal(occurrences(svg, 'data-position-family="'), 5, "Every map must retain all five CAGED region contours");
        assert.equal(occurrences(svg, 'data-position-anchor="'), 5, "Every map must label P1–P5 independently of modes");
        assert.equal(occurrences(svg, 'data-modal-anchor="'), 7, "Every map must label all seven modal roots");
        assert.equal(occurrences(svg, 'data-selected-modal-anchor="true"'), 1, "Exactly one modal-root landmark must be selected");
        assert.equal(occurrences(svg, 'data-active-position="'), selectedFamily ? 1 : 0, "Only a chosen CAGED region gets an active contour");
        if (selectedFamily) {
          assert(svg.includes(`data-active-position="${position}" data-caged-form="${selectedFamily.cagedForm}"`));
        }
        for (const family of context.data.positionFamilies) {
          assert(svg.includes(`P${family.position} · ${family.cagedForm}-form`), `P${family.position} must retain its ${family.cagedForm}-form label`);
        }
        for (const modalAnchor of context.modes) {
          assert(svg.includes(`${modalAnchor.numeral} · ${modalAnchor.tonic} ${modalAnchor.name}`), `${modalAnchor.tonic} ${modalAnchor.name} must remain visible as a distinct modal landmark`);
        }

        assert.equal(occurrences(svg, 'data-overview-note="true"'), entries.length, "Every physical parent-scale note in range must render once");
        assert.equal(occurrences(svg, 'data-inside-position="true"'), scoped.length, "Position selection must use only physical CAGED geometry");
        assert.equal(occurrences(svg, 'data-overview-root="true"'), expectedRootCount, "Mode selection must ring every occurrence of its tonic across the neck");

        const visibleCount = overlay === "pentatonic"
          ? scoped.filter((entry) => entry.tone.core).length
          : scoped.length;
        assert.equal(occurrences(svg, 'data-overview-visible-in-view="true"'), visibleCount);

        const expectedCharacteristics = overlay === "characteristic"
          ? scoped.filter((entry) => context.selectedMode.characteristicDegrees.includes(entry.tone.degree)).length
          : 0;
        assert.equal(occurrences(svg, 'data-overview-characteristic="true"'), expectedCharacteristics);

        const modalChordDegrees = overlay === "triad" || overlay === "seventh"
          ? new Set(renderer.overlayFor(context.selectedMode, overlay).degrees)
          : new Set();
        const expectedModalChordCount = modalChordDegrees.size
          ? scoped.filter((entry) => modalChordDegrees.has(entry.tone.degree)).length
          : 0;
        assert.equal(occurrences(svg, 'data-overview-modal-tonic-chord="true"'), expectedModalChordCount);
        const expectedSeventhCount = overlay === "seventh"
          ? scoped.filter((entry) => entry.tone.degree === context.selectedMode.tones[6].degree).length
          : 0;
        assert.equal(occurrences(svg, 'data-overview-added-seventh="true"'), expectedSeventhCount);

        if (overlay === "pentatonic") {
          assert(svgTag.includes('data-pentatonic-scope="full-neck"'));
          assert.equal(occurrences(svg, 'data-overview-pentatonic-note="true"'), expectedCoreCount, "Pentatonic-only focus must span the full displayed neck");
          assert.equal(occurrences(svg, "pentatonic-hidden"), expectedNonCoreCount + 1, "Every non-core note plus the CSS selector must identify the hidden pentatonic complement");
        } else {
          assert(!svgTag.includes("data-pentatonic-scope="));
          assert.equal(occurrences(svg, 'data-overview-pentatonic-note="true"'), 0);
        }

        const sites = overlay === "caged" ? cagedSites(context, position) : new Map();
        assert.equal(occurrences(svg, 'data-overview-caged-chord="true"'), sites.size, "CAGED highlight must show each unique chord site once");
        if (overlay === "caged") {
          const parentDegreeByPc = new Map([
            [context.data.parentScale.pitchClasses[0], "1"],
            [context.data.parentScale.pitchClasses[2], "3"],
            [context.data.parentScale.pitchClasses[4], "5"]
          ]);
          const expectedDegreeCounts = new Map([["1", 0], ["3", 0], ["5", 0]]);
          for (const key of sites.keys()) {
            const [stringIndex, fret] = key.split(":").map(Number);
            const pc = pitchClass(context.data.strings[stringIndex].openPitchClass, fret);
            const degree = parentDegreeByPc.get(pc);
            assert(degree, "Every transposed CAGED note must remain in the selected parent-major tonic triad");
            expectedDegreeCounts.set(degree, expectedDegreeCounts.get(degree) + 1);
          }
          for (const [degree, count] of expectedDegreeCounts) {
            assert.equal(occurrences(svg, `data-overview-caged-degree="${degree}"`), count);
          }
          const renderedCaged = noteGroups(svg).filter((group) => group.includes('data-overview-caged-chord="true"'));
          assert.equal(renderedCaged.length, sites.size);
          for (const group of renderedCaged) {
            const dataDegree = group.match(/data-overview-caged-degree="([135])"/)?.[1];
            assert.equal(noteGroupDegree(group), dataDegree, "CAGED markers must display parent-major degrees, not modal degrees");
          }
        }

        filenames.add(renderer.overviewFileStem(data, tonicPitchClass, mode, position, overlay));
      }
    }
  }
}

assert.equal(combinationCount, 12 * 7 * 6 * 6, "The regression matrix must cover 12 parent keys × 7 modes × 6 position scopes × 6 highlights");
assert.equal(filenames.size, combinationCount, "Every four-control combination must have a collision-free SVG filename");
assert.equal(
  renderer.overviewFileStem(data, 9, "dorian", 1, "characteristic"),
  "g-parent-a-dorian-p1-e-form-characteristic-connected-map"
);
assert.equal(
  renderer.overviewFileStem(data, 3, "dorian", 1, "caged"),
  "db-parent-eb-dorian-p1-e-form-caged-connected-map"
);

// The requested teaching example: same G-major P1 region, relabeled around A as tonic.
const ionianContext = renderer.deriveOverviewContext(data, { tonicPitchClass: 7, mode: "ionian" });
const dorianContext = renderer.deriveOverviewContext(data, { tonicPitchClass: 9, mode: "dorian" });
assert.equal(dorianContext.parentKey.tonic, "G");
assert.equal(dorianContext.selectedMode.tonic, "A");
assert.equal(dorianContext.selectedMode.anchor.fret, 5);
assert.deepEqual(dorianContext.data.positionFamilies, ionianContext.data.positionFamilies, "Changing mode must not move or reshape any CAGED region");

const ionianP1 = renderer.renderOverviewSvg(data, { tonicPitchClass: 7, mode: "ionian", position: 1, overlay: "none" });
const dorianP1 = renderer.renderOverviewSvg(data, { tonicPitchClass: 9, mode: "dorian", position: 1, overlay: "none" });
const ionianInside = noteGroups(ionianP1).filter((group) => group.includes('data-inside-position="true"'));
const dorianInside = noteGroups(dorianP1).filter((group) => group.includes('data-inside-position="true"'));
assert.deepEqual(dorianInside.map(noteGroupKey), ionianInside.map(noteGroupKey), "G Ionian P1 and A Dorian P1 must use the identical physical E-form scale region");
assert.notDeepEqual(dorianInside.map(noteGroupDegree), ionianInside.map(noteGroupDegree), "Changing mode must relabel intervals without changing frets");

const dorianLowE5 = noteGroups(dorianP1).find((group) => noteGroupKey(group) === "6:5");
assert(dorianLowE5, "A Dorian P1 must include low-E fret 5");
assert(dorianLowE5.includes('data-overview-root="true"'), "A on low-E fret 5 must be ringed as the Dorian tonic");
assert.equal(noteGroupDegree(dorianLowE5), "1", "A on low-E fret 5 must be labeled 1 in Dorian");
const ionianLowE5 = noteGroups(ionianP1).find((group) => noteGroupKey(group) === "6:5");
assert.equal(noteGroupDegree(ionianLowE5), "2", "The same low-E fret 5 remains degree 2 in G Ionian");
assert(dorianP1.includes("ii · A Dorian"));
assert(dorianP1.includes("P1 · E-form"));

const dorianP5 = renderer.renderOverviewSvg(data, { tonicPitchClass: 9, mode: "dorian", position: 5, overlay: "none" });
assert(dorianP5.includes('data-tonic-pitch-class="9"'), "Changing position must not change A Dorian's tonic");
assert.equal(occurrences(dorianP5, 'data-overview-root="true"'), occurrences(dorianP1, 'data-overview-root="true"'), "Changing position must not change the full-neck tonic map");
assert.notDeepEqual(
  noteGroups(dorianP5).filter((group) => group.includes('data-inside-position="true"')).map(noteGroupKey),
  dorianInside.map(noteGroupKey),
  "Changing position must change only the emphasized physical region"
);

const aIonianP1Context = renderer.deriveOverviewContext(data, { tonicPitchClass: 9, mode: "ionian" });
assert.equal(aIonianP1Context.parentKey.tonic, "A", "Changing A from Dorian to Ionian must derive a different parent");
assert.equal(aIonianP1Context.data.positionFamilies[0].position, dorianContext.data.positionFamilies[0].position);
assert.equal(aIonianP1Context.data.positionFamilies[0].cagedForm, "E");
assert.notDeepEqual(
  aIonianP1Context.data.positionFamilies[0].scaleFretsByString,
  dorianContext.data.positionFamilies[0].scaleFretsByString,
  "With tonic fixed at A, changing mode must transpose the parent-based geometry while keeping P1 selected as the E-form family"
);

// Legacy renderer callers remain valid while the app stores the four independent controls.
for (const template of data.modes) {
  assert.equal(
    renderer.renderOverviewSvg(data, { focusMode: template.id, overlay: "none" }),
    renderer.renderOverviewSvg(data, { tonicPitchClass: template.tonicPitchClass, mode: renderer.modeKeyFor(template), position: template.position, overlay: "none" }),
    `${template.name}'s legacy focusMode API must preserve its old coupled region`
  );
}
assert.equal(
  renderer.renderOverviewSvg(data, { focusMode: "all", overlay: "none" }),
  renderer.renderOverviewSvg(data, { tonicPitchClass: 7, mode: "ionian", position: "all", overlay: "none" }),
  "Legacy all-focus must map to the reference G Ionian/all-position view"
);
assert.equal(
  renderer.renderOverviewSvg(data, { parentPitchClass: 7, mode: "dorian", position: 1, overlay: "none" }),
  renderer.renderOverviewSvg(data, { tonicPitchClass: 9, mode: "dorian", position: 1, overlay: "none" }),
  "The legacy parentPitchClass API must still derive A as the Dorian tonic over G major"
);
assert.equal(renderer.overviewFocusMode(data, "a-dorian"), data.modes[1]);
assert.equal(renderer.overviewFocusMode(data, "dorian"), data.modes[1]);
assert.equal(renderer.overviewFocusMode(data, "not-a-mode"), null);

console.log(`Verified ${combinationCount} connected-map combinations, transposition, anchors, CAGED degrees, independence, filenames, and legacy rendering.`);
