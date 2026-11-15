"use strict";
const assert = require("node:assert/strict");
const engine = require("../src/circle-of-fifths-engine.js");
const renderer = require("../src/circle-of-fifths-render.js");
const data = require("../src/diagram-data.js");
const mod = (n) => (n % 12 + 12) % 12;
const pitch = (note) => mod(({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 })[note[0]] + (note.includes("♯") ? 1 : note.includes("♭") ? -1 : 0));

const fixtures = {
  C: { circle: ["F", "C", "G", "Dm", "Am", "Em", "Bdim"], signature: 0, relative: "Am" },
  G: { circle: ["C", "G", "D", "Am", "Em", "Bm", "F♯dim"], signature: 1, relative: "Em" },
  Bb: { circle: ["E♭", "B♭", "F", "Cm", "Gm", "Dm", "Adim"], signature: -2, relative: "Gm" },
  "F#": { circle: ["B", "F♯", "C♯", "G♯m", "D♯m", "A♯m", "E♯dim"], signature: 6, relative: "D♯m" },
  Gb: { circle: ["C♭", "G♭", "D♭", "A♭m", "E♭m", "B♭m", "Fdim"], signature: -6, relative: "E♭m" },
  "C#": { circle: ["F♯", "C♯", "G♯", "D♯m", "A♯m", "E♯m", "B♯dim"], signature: 7, relative: "A♯m" },
  Cb: { circle: ["F♭", "C♭", "G♭", "D♭m", "A♭m", "E♭m", "B♭dim"], signature: -7, relative: "A♭m" }
};
for (const [key, expected] of Object.entries(fixtures)) {
  const c = engine.context({ key });
  assert.deepEqual(c.circleChords.map((chord) => chord.name), expected.circle, `${key}: reference chords in circle order`);
  assert.equal(c.key.signature, expected.signature);
  assert.equal(c.key.relativeMinor, expected.relative);
}

// Keep the existing fretboard's conventional key spellings consistent with this reference.
for (const key of data.majorKeys) {
  assert.deepEqual(engine.context({ key: key.tonic }).key.notes, key.notes);
}
assert.equal(engine.keys.length, 15, "Twelve slices include three enharmonic alternatives");
assert.equal(engine.sectors.length, 12);
for (const key of engine.keys) {
  const settings = { key: key.id };
  const c = engine.context(settings);
  assert.deepEqual(key.notes.map((note) => mod(pitch(note) - key.pitchClass)), [0, 2, 4, 5, 7, 9, 11]);
  assert.equal(new Set(key.notes.map((note) => note[0])).size, 7, "Each scale uses every letter exactly once");
  assert.equal(key.notes.filter((note) => note.length > 1).length, Math.abs(key.signature));
  assert.equal(mod(pitch(key.relativeMinor) - key.pitchClass), 9);
  assert.equal(key.accidentals.length, Math.abs(key.signature));
  assert.equal(c.chords.filter((chord) => chord.quality === "major").length, 3);
  assert.equal(c.chords.filter((chord) => chord.quality === "minor").length, 3);
  assert.equal(c.chords.filter((chord) => chord.quality === "diminished").length, 1);
  assert.deepEqual(c.circleChords.map((chord) => chord.numeral), ["IV", "I", "V", "ii", "vi", "iii", "vii°"]);
  assert.deepEqual(c.circleChords.map((chord) => chord.symbol), ["M", "M", "M", "m", "m", "m", "dim"]);
  for (const chord of c.circleChords) {
    assert.equal(mod(chord.index * 7), pitch(chord.root), "Outer box is above its root's slice");
    const expected = chord.quality === "major" ? [0, 4, 7] : chord.quality === "minor" ? [0, 3, 7] : [0, 3, 6];
    assert.deepEqual(chord.notes.map((note) => mod(pitch(note) - pitch(chord.root))), expected, `${key.id}: ${chord.name} triad quality`);
    assert(chord.notes.every((note) => key.notes.includes(note)), "All chord tones belong to the selected scale");
  }
  assert.equal(c.segments.filter((segment) => segment.selected).length, 1);
  assert.equal(c.segments.find((segment) => segment.selected).key.id, key.id);
  assert.equal(c.segments.filter((segment) => segment.minorChord).length, 3);
  assert.equal(c.segments.filter((segment) => segment.majorChord).length, 3);
  for (const segment of c.segments) {
    assert.equal(mod(pitch(segment.key.relativeMinor) - pitch(segment.key.tonic)), 9);
    if (segment.minorChord) assert.equal(pitch(segment.minorChord.root), pitch(segment.key.relativeMinor));
    if (segment.majorChord) assert.equal(pitch(segment.majorChord.root), pitch(segment.key.tonic));
  }
  for (const direction of [-1, 1]) {
    const next = engine.context(engine.neighbor(settings, direction));
    assert.equal(next.key.pitchClass, mod(key.pitchClass + direction * 7), "Navigation wraps through fifths/fourths");
  }
  const svg = renderer.render(engine, settings);
  assert(!/NaN|undefined|Infinity/.test(svg));
  assert.equal((svg.match(/role="button"/g) || []).length, 12);
  assert.equal((svg.match(/tabindex="0"/g) || []).length, 1, "One tab stop enters the keyboard-navigable circle");
  assert.equal((svg.match(/aria-pressed="true"/g) || []).length, 1);
  assert.equal((svg.match(/data-degree=/g) || []).length, 7);
}
assert.deepEqual(engine.context({ key: "Gb" }).key.accidentals, ["B♭", "E♭", "A♭", "D♭", "G♭", "C♭"]);
assert.deepEqual(engine.context({ key: "F#" }).key.accidentals, ["F♯", "C♯", "G♯", "D♯", "A♯", "E♯"]);
assert.deepEqual(engine.context({ key: "C#" }).enharmonicReferences, ["G♯ = A♭", "E♯m = Fm"]);
assert.deepEqual(engine.normalize({ key: "F♯" }), { key: "F#" });
assert.deepEqual(engine.normalize({ key: "G♭" }), { key: "Gb" });
for (const invalid of [null, {}, { key: "constructor" }, { key: "G#" }, { key: "<script>" }, { key: 6 }]) {
  assert.deepEqual(engine.normalize(invalid), { key: "C" });
}
console.log("Verified all 15 key spellings, signatures, 105 triads, circle placement, enharmonic references, navigation, and accessible SVGs.");
