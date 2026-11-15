(function exposeCircleOfFifths(root, factory) {
  const engine = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = engine;
  if (root) root.GuitarCircleOfFifths = engine;
}(typeof globalThis !== "undefined" ? globalThis : this, function buildCircleOfFifths() {
  "use strict";

  const mod = (value, base = 12) => (value % base + base) % base;
  const letters = ["C", "D", "E", "F", "G", "A", "B"];
  const naturalPitches = [0, 2, 4, 5, 7, 9, 11];
  const sharpOrder = ["F", "C", "G", "D", "A", "E", "B"];
  const flatOrder = [...sharpOrder].reverse();
  const numerals = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
  const qualities = ["major", "minor", "minor", "major", "major", "minor", "diminished"];
  const circleOrder = [3, 0, 4, 1, 5, 2, 6];
  const colors = ["#b34545", "#a16b19", "#697b25", "#27815c", "#247b89", "#3865a7", "#6654aa", "#8b4999", "#a33d78", "#ac495e", "#a85c38", "#918122"];
  // Each pair occupies one slice. The spelling nearest the selected key is shown.
  const definitions = [
    [["C", 0]], [["G", 1]], [["D", 2]], [["A", 3]], [["E", 4]],
    [["B", 5], ["Cb", -7]], [["F#", 6], ["Gb", -6]],
    [["Db", -5], ["C#", 7]], [["Ab", -4]], [["Eb", -3]], [["Bb", -2]], [["F", -1]]
  ];

  function makeKey(id, signature, index) {
    const accidental = signature < 0 ? "♭" : "♯";
    const altered = (signature < 0 ? flatOrder : sharpOrder).slice(0, Math.abs(signature));
    const start = letters.indexOf(id[0]);
    const notes = letters.map((_, offset) => {
      const letter = letters[(start + offset) % 7];
      return letter + (altered.includes(letter) ? accidental : "");
    });
    return { id, index, signature, tonic: notes[0], relativeMinor: `${notes[5]}m`, notes,
      pitchClass: mod(index * 7), accidentals: altered.map((letter) => letter + accidental) };
  }

  const sectors = definitions.map((variants, index) => ({ index, color: colors[index],
    keys: variants.map(([id, signature]) => makeKey(id, signature, index)) }));
  const keys = sectors.flatMap((sector) => sector.keys);

  function normalize(settings = {}) {
    const candidate = typeof settings?.key === "string" ? settings.key.replaceAll("♯", "#").replaceAll("♭", "b") : "";
    return { key: keys.some((key) => key.id === candidate) ? candidate : "C" };
  }

  function signatureLabel(key) {
    return key.signature === 0 ? "0" : `${Math.abs(key.signature)}${key.signature < 0 ? "♭" : "♯"}`;
  }

  function signatureDescription(key) {
    const count = Math.abs(key.signature);
    return count === 0 ? "No sharps or flats" : `${count} ${key.signature < 0 ? "flat" : "sharp"}${count === 1 ? "" : "s"}`;
  }

  function pitchClass(note) {
    return mod(naturalPitches[letters.indexOf(note[0])] + [...note].filter((c) => c === "♯").length - [...note].filter((c) => c === "♭").length);
  }

  function context(settings) {
    const key = keys.find((item) => item.id === normalize(settings).key);
    const chords = key.notes.map((note, degree) => {
      const quality = qualities[degree];
      return { degree: degree + 1, numeral: numerals[degree], quality,
        symbol: quality === "major" ? "M" : quality === "minor" ? "m" : "dim",
        root: note, pitchClass: pitchClass(note),
        name: note + (quality === "minor" ? "m" : quality === "diminished" ? "dim" : ""),
        notes: [note, key.notes[(degree + 2) % 7], key.notes[(degree + 4) % 7]] };
    });
    const circleChords = circleOrder.map((degree, offset) => ({ ...chords[degree], index: mod(key.index + offset - 1), color: colors[mod(key.index + offset - 1)] }));
    const segments = sectors.map((sector) => {
      const displayed = [...sector.keys].sort((a, b) => Math.abs(a.signature - key.signature) - Math.abs(b.signature - key.signature))[0];
      const majorChord = chords.find((chord) => chord.quality === "major" && chord.pitchClass === displayed.pitchClass);
      const minorChord = chords.find((chord) => chord.quality === "minor" && chord.pitchClass === mod(displayed.pitchClass + 9));
      return { ...sector, key: displayed, selected: sector.index === key.index, majorChord, minorChord };
    });
    const enharmonicReferences = segments.flatMap((segment) => [
      ...(segment.majorChord && segment.majorChord.name !== segment.key.tonic ? [`${segment.majorChord.name} = ${segment.key.tonic}`] : []),
      ...(segment.minorChord && segment.minorChord.name !== segment.key.relativeMinor ? [`${segment.minorChord.name} = ${segment.key.relativeMinor}`] : [])
    ]);
    return { key, chords, circleChords, segments, enharmonicReferences };
  }

  function neighbor(settings, direction) {
    const current = context(settings);
    return { key: current.segments[mod(current.key.index + direction)].key.id };
  }

  return { keys, sectors, circleOrder, normalize, context, neighbor, signatureLabel, signatureDescription };
}));
