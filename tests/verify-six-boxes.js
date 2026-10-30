"use strict";
const assert = require("node:assert/strict");
const data = require("../src/diagram-data.js");
const engine = require("../src/six-boxes-engine.js");
const mod = (v) => (v % 12 + 12) % 12;
const intervals = { scale: [0,2,4,5,7,9,11], pentatonic: [0,2,4,7,9], triad: [0,4,7] };

// A-major diagram fixtures transcribed from the lesson, high e → low E.
const source = {
  "e-behind": [[2,4,5],[2,3,5],[1,2,4],[2,4],[2,4,5],[2,4,5]],
  "e-straddling": [[4,5,7],[5,7],[4,6,7],[4,6,7],[4,5,7],[4,5,7]],
  "e-front": [[7,9,10],[7,9,10],[6,7,9],[6,7,9],[5,7,9],[5,7,9]],
  "a-behind": [[9,10,12],[9,10,12],[9,11],[9,11,12],[9,11,12],[9,10,12]],
  "a-straddling": [[12,14],[12,14,15],[11,13,14],[11,12,14],[11,12,14],[12,14]],
  "a-front": [[14,16,17],[14,15,17],[13,14,16],[12,14,16],[12,14,16],[12,14,16]]
};
const a = engine.context(data, { tonic: 9 });
for (const b of a.boxes) assert.deepEqual(b.fretsByString, source[b.id], `${b.id} matches the source scale diagram`);
const diagonal = engine.context(data, { tonic: 9, palette: "pentatonic" });
assert.deepEqual(diagonal.boxes.find((b) => b.id === "e-front").fretsByString,
  [[12,14],[10,12,14],[9,11],[7,9,11],[7,9],[5,7,9]]);
assert.deepEqual(diagonal.boxes.find((b) => b.id === "a-front").fretsByString,
  [[17,19,21],[17,19],[14,16,18],[14,16],[12,14,16],[12,14]]);
assert.deepEqual(engine.context(data, { tonic: 2 }).boxes.map((b) => b.id),
  ["a-behind", "a-straddling", "a-front", "e-behind", "e-straddling", "e-front"]);

let count = 0;
for (let tonic = 0; tonic < 12; tonic++) {
  for (const [palette, allowed] of Object.entries(intervals)) {
    const c = engine.context(data, { tonic, palette });
    assert.equal(c.boxes.length, 6);
    assert(c.minFret >= 0 && c.maxFret <= 24, "Complete shapes stay on a 24-fret guitar");
    for (const b of c.boxes) {
      assert.equal(mod(data.strings[b.string - 1].openPitchClass + b.rootFret), tonic);
      assert(b.fretsByString[b.string - 1].includes(b.rootFret), "Named anchor belongs to its shape");
      const found = new Set();
      b.fretsByString.forEach((frets, i) => {
        assert(frets.length > 0, "Every string has playable notes");
        assert.equal(new Set(frets).size, frets.length);
        frets.forEach((f) => {
          const interval = mod(data.strings[i].openPitchClass + f - tonic);
          assert(allowed.includes(interval), `${b.id}, ${palette}, key ${tonic}: unexpected pitch at string ${i+1} fret ${f}`);
          found.add(interval);
        });
        if (palette === "scale" && b.id.endsWith("front")) assert.equal(frets.length, 3);
      });
      assert.deepEqual([...found].sort((x,y) => x-y), allowed);
    }
    for (const box of ["all", ...c.boxes.map((b) => b.id)]) {
      for (const labels of ["intervals", "notes"]) {
        const focused = engine.context(data, { tonic, palette, box, labels });
        for (const n of focused.entries.filter((n) => n.active)) {
          assert(n.members.length > 0);
          if (box !== "all") assert(n.members.includes(box));
          assert.equal(n.note, focused.key.notes[n.degree - 1]);
        }
        const svg = engine.render(data, { tonic, palette, box, labels });
        assert(!/NaN|undefined|Infinity/.test(svg));
        assert.equal((svg.match(/data-shape=/g) || []).length, 6);
        assert(svg.includes(`data-box="${box}"`));
        count++;
      }
    }
  }
}
assert.deepEqual(engine.normalize({ tonic: "-1", box: "bad", palette: "constructor", labels: "bad" }),
  { tonic: 9, box: "all", palette: "scale", labels: "intervals" });
assert.equal(engine.normalize({ tonic: "0" }).tonic, 0);
assert.equal(engine.normalize({ tonic: "" }).tonic, 9);
console.log(`Verified six-box source geometry, diagonal routes, all keys and ${count} rendered selections.`);
