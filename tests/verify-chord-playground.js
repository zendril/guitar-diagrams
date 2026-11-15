"use strict";
const assert = require("node:assert/strict");
const engine = require("../src/chord-playground-engine.js");
const circle = require("../src/circle-of-fifths-engine.js");
const renderer = require("../src/chord-playground-render.js");
const mod = (n) => (n % 12 + 12) % 12;
const pitch = (note) => mod(({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 })[note[0]] + [...note.slice(1)].reduce((sum, c) => sum + (c === "#" ? 1 : -1), 0));

const fixtures = {
  C: ["C", "E", "G"], Cm: ["C", "Eb", "G"], C7: ["C", "E", "G", "Bb"],
  Cmaj7: ["C", "E", "G", "B"], Cm7: ["C", "Eb", "G", "Bb"], Csus4: ["C", "F", "G"],
  Cdim: ["C", "Eb", "Gb"], Csus2: ["C", "D", "G"], Cadd9: ["C", "E", "G", "D"],
  C9: ["C", "E", "G", "Bb", "D"], Cm7b5: ["C", "Eb", "Gb", "Bb"],
  "F#maj7": ["F#", "A#", "C#", "E#"], Bbm7: ["Bb", "Db", "F", "Ab"],
  "B#7": ["B#", "D##", "F##", "A#"], Cbdim: ["Cb", "Ebb", "Gbb"]
};
for (const [symbol, notes] of Object.entries(fixtures)) assert.deepEqual(engine.parseChord(symbol).notes, notes, symbol);
assert.equal(engine.parseChord("cM7").symbol, "Cmaj7");
assert.equal(engine.parseChord("cm7").symbol, "Cm7");
assert.equal(engine.parseChord("d♭min7").symbol, "Dbm7");
assert.equal(engine.parseChord("Bø7").symbol, "Bm7b5");
assert.equal(engine.parseChord("FΔ7").symbol, "Fmaj7");
assert.deepEqual(engine.parseChord("C7/E").midi, [52, 55, 58, 60]);
assert.deepEqual(engine.parseChord("C9/D").midi, [62, 64, 67, 70, 72], "A ninth in the bass lifts the root two octaves");
assert.equal(engine.parseChord("C7/A#").symbol, "C7/Bb", "Enharmonic bass input uses the chord's spelling");

let voicings = 0;
for (const root of engine.roots) for (const quality of engine.qualities) {
  for (let inversion = 0; inversion < quality.intervals.length; inversion++) {
    const chord = engine.chord(root, quality.id, inversion);
    assert.deepEqual(chord.notes.map((note) => mod(pitch(note) - pitch(root))), quality.intervals.map(mod));
    assert.equal(chord.voicedNotes[0], chord.notes[inversion], "The selected chord tone is the lowest voice");
    assert(chord.midi.every((midi, i) => !i || midi > chord.midi[i - 1]), "Inversions ascend without duplicate voices");
    assert.deepEqual(chord.midi.map(mod), chord.voicedNotes.map(pitch));
    assert.deepEqual(engine.parseChord(chord.symbol).midi, chord.midi, "Slash symbols round-trip every inversion");
    const moved = engine.transpose(chord, 7);
    assert.equal(moved.quality, quality.id); assert.equal(moved.inversion, inversion);
    assert.deepEqual(moved.midi.map(mod), chord.midi.map((midi) => mod(midi + 7)));
    voicings++;
  }
}

const blues = engine.parse("c7 c7 c7 c7 f7 f7 c7 c7 g7 f7 c7 c7");
assert(blues.ok); assert.equal(blues.bars.length, 12); assert.equal(blues.totalBeats, 48);
assert.deepEqual(blues.events.map((event) => event.chord.symbol), ["C7", "C7", "C7", "C7", "F7", "F7", "C7", "C7", "G7", "F7", "C7", "C7"]);
const split = engine.parse("| Dm7:2 G7:2 |\n Cmaj7/E |");
assert(split.ok); assert.equal(split.bars.length, 2); assert.equal(split.totalBeats, 8);
assert.deepEqual(split.events.map((event) => event.startBeat), [0, 2, 4]);
assert.deepEqual(split.events.map((event) => event.beats), [2, 2, 4]);
assert.equal(engine.format(split.events), "Dm7:2 G7:2 | Cmaj7/E");
for (const source of [blues, split]) {
  const roundTrip = engine.parse(engine.format(source.events));
  assert(roundTrip.ok);
  assert.deepEqual(roundTrip.events.map((event) => [event.chord.symbol, event.beats]), source.events.map((event) => [event.chord.symbol, event.beats]));
}
for (const bad of ["", "H7", "C13", "C7/H", "C7/F", "C7:0", "C7:5", "C7:2.5", "C7:2:2", "C7:3 F7:2", "C7:2", "C7:2 | G7:2", "C ".repeat(257)]) {
  const parsed = engine.parse(bad);
  assert(!parsed.ok, bad); assert(parsed.errors.length, bad); assert.equal(parsed.bars.length, 0);
  assert.throws(() => engine.schedule(parsed, {}), /Correct the progression/);
}
assert(engine.parse("C:1 Dm:1 Em:1 F:1").ok);

const home = circle.context({ key: "C" }).key;
for (const [symbol, degree] of Object.entries({ C7: "I7", F7: "IV7", G7: "V7", Dm7: "ii7", Fm7: "iv7", Eb: "♭III", Gb: "♭V", "F#dim": "♯iv°" })) {
  assert.equal(engine.numeral(engine.parseChord(symbol), home), degree);
}
for (const key of circle.keys) {
  for (const preset of engine.presets) {
    const moved = engine.parse(engine.preset(preset.id, key));
    const original = engine.parse(preset.text);
    assert(moved.ok, `${preset.id} in ${key.id}`);
    assert.equal(moved.totalBeats, original.totalBeats);
    assert.deepEqual(moved.events.map((event) => event.chord.pitchClass), original.events.map((event) => mod(event.chord.pitchClass + key.pitchClass)));
    assert.deepEqual(moved.events.map((event) => event.chord.quality), original.events.map((event) => event.chord.quality));
  }
  const selection = engine.chord(key.id, "7");
  const context = circle.context({ key: key.id });
  const degrees = renderer.degrees(engine, context, selection);
  assert.equal(degrees.find((entry) => entry.degree === 1).chord.symbol, selection.symbol);
  assert(degrees.every((entry) => entry.chord.pitchClass === mod(entry.index * 7)), "Degree boxes line up with their roots");
  const svg = renderer.wheel(engine, context, selection);
  assert(!/NaN|undefined|Infinity/.test(svg));
  assert.equal((svg.match(/aria-pressed="true"/g) || []).length, 1);
}
assert.equal(engine.parse(engine.preset("blues", circle.context({ key: "Cb" }).key)).events[0].chord.symbol, "Cb7");
const cb = circle.context({ key: "Cb" }).key;
assert.equal(engine.transposeKey(engine.parseChord("F7/A"), home, cb).symbol, "Fb7/Ab");
assert.equal(engine.transposeKey(engine.parseChord("C9/D"), home, circle.context({ key: "F#" }).key).symbol, "F#9/G#");
for (const key of circle.keys) for (const event of split.events) {
  const moved = engine.transposeKey(event.chord, home, key);
  assert.deepEqual(engine.transposeKey(moved, key, home), event.chord, "Transposition back to the home key restores spelling, quality, and inversion");
}

for (const [pattern, strokes] of [["hold", 1], ["down", 4], ["alternate", 8], ["pop", 6]]) {
  const queue = engine.schedule(engine.parse("C7 F7"), { pattern, countIn: true, metronome: true });
  const chords = queue.filter((event) => event.kind === "chord");
  assert.equal(chords.length, strokes * 2);
  assert.equal(queue.filter((event) => event.kind === "click").length, 12);
  assert.deepEqual(queue.filter((event) => event.beat < 0).map((event) => event.beat), [-4, -3, -2, -1]);
  assert(chords.every((event) => event.beat + event.duration <= (event.eventIndex + 1) * 4), "A stroke must finish by the chord change");
  if (pattern === "alternate") assert.deepEqual(chords.slice(0, 4).map((event) => event.direction), ["down", "up", "down", "up"]);
}
const sharedQueue = engine.schedule(split, { pattern: "pop", countIn: false });
assert.deepEqual(sharedQueue.filter((event) => event.eventIndex === 1).map((event) => event.beat), [2, 3, 3.5], "Strum patterns restart on a chord change");
assert.equal(engine.options({ bpm: 1000 }).bpm, 240);
assert.equal(engine.options({ bpm: 1 }).bpm, 40);
console.log(`Verified ${voicings} chord voicings, spelling, inversions, progression validation, all presets/keys, degree references, and rhythm schedules.`);
