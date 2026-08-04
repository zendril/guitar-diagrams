(function exposeDiagramData(root, factory) {
  const data = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = data;
  if (root) root.GuitarDiagramData = data;
}(typeof globalThis !== "undefined" ? globalThis : this, function buildDiagramData() {
  "use strict";

  const tone = (semitones, degree, core) => ({ semitones, degree, core });

  return {
    schemaVersion: 1,
    sourceRevision: 3,
    title: "Relative modes of the major scale",
    parentScale: {
      tonic: "G",
      pitchClasses: [7, 9, 11, 0, 2, 4, 6],
      notes: ["G", "A", "B", "C", "D", "E", "F♯"]
    },
    strings: [
      { number: 1, name: "e", openPitchClass: 4 },
      { number: 2, name: "B", openPitchClass: 11 },
      { number: 3, name: "G", openPitchClass: 7 },
      { number: 4, name: "D", openPitchClass: 2 },
      { number: 5, name: "A", openPitchClass: 9 },
      { number: 6, name: "E", openPitchClass: 4 }
    ],
    pitchClassNames: {
      0: "C",
      1: "C♯",
      2: "D",
      3: "E♭",
      4: "E",
      5: "F",
      6: "F♯",
      7: "G",
      8: "A♭",
      9: "A",
      10: "B♭",
      11: "B"
    },
    positionFamilies: [
      { position: 1, cagedForm: "E" },
      { position: 2, cagedForm: "D" },
      { position: 3, cagedForm: "C" },
      { position: 4, cagedForm: "A" },
      { position: 5, cagedForm: "G" }
    ],
    modes: [
      {
        id: "g-ionian",
        numeral: "I",
        tonic: "G",
        tonicPitchClass: 7,
        name: "Ionian",
        position: 1,
        accent: "#2563eb",
        anchor: { string: 6, fret: 3 },
        characteristicDegrees: ["4", "7"],
        tonicChord: { triadQuality: "major", seventhQuality: "maj7" },
        pentatonicName: "G major pentatonic",
        tones: [tone(0, "1", true), tone(2, "2", true), tone(4, "3", true), tone(5, "4", false), tone(7, "5", true), tone(9, "6", true), tone(11, "7", false)],
        fretsByString: [[2, 3, 5], [3, 5], [2, 4, 5], [2, 4, 5], [2, 3, 5], [3, 5]]
      },
      {
        id: "a-dorian",
        numeral: "ii",
        tonic: "A",
        tonicPitchClass: 9,
        name: "Dorian",
        position: 2,
        accent: "#7c3aed",
        anchor: { string: 6, fret: 5 },
        characteristicDegrees: ["6"],
        tonicChord: { triadQuality: "minor", seventhQuality: "m7" },
        pentatonicName: "A minor pentatonic",
        tones: [tone(0, "1", true), tone(2, "2", false), tone(3, "b3", true), tone(5, "4", true), tone(7, "5", true), tone(9, "6", false), tone(10, "b7", true)],
        fretsByString: [[5, 7, 8], [5, 7, 8], [4, 5, 7], [4, 5, 7], [5, 7], [5, 7, 8]]
      },
      {
        id: "b-phrygian",
        numeral: "iii",
        tonic: "B",
        tonicPitchClass: 11,
        name: "Phrygian",
        position: 3,
        accent: "#059669",
        anchor: { string: 6, fret: 7 },
        characteristicDegrees: ["b2"],
        tonicChord: { triadQuality: "minor", seventhQuality: "m7" },
        pentatonicName: "B minor pentatonic",
        tones: [tone(0, "1", true), tone(1, "b2", false), tone(3, "b3", true), tone(5, "4", true), tone(7, "5", true), tone(8, "b6", false), tone(10, "b7", true)],
        fretsByString: [[7, 8, 10], [7, 8, 10], [7, 9], [7, 9, 10], [7, 9, 10], [7, 8, 10]]
      },
      {
        id: "c-lydian",
        numeral: "IV",
        tonic: "C",
        tonicPitchClass: 0,
        name: "Lydian",
        position: 3,
        accent: "#16a34a",
        anchor: { string: 6, fret: 8 },
        characteristicDegrees: ["#4"],
        tonicChord: { triadQuality: "major", seventhQuality: "maj7" },
        pentatonicName: "C major pentatonic",
        tones: [tone(0, "1", true), tone(2, "2", true), tone(4, "3", true), tone(6, "#4", false), tone(7, "5", true), tone(9, "6", true), tone(11, "7", false)],
        fretsByString: [[7, 8, 10], [7, 8, 10], [7, 9], [7, 9, 10], [7, 9, 10], [8, 10]]
      },
      {
        id: "d-mixolydian",
        numeral: "V",
        tonic: "D",
        tonicPitchClass: 2,
        name: "Mixolydian",
        position: 4,
        accent: "#92400e",
        anchor: { string: 6, fret: 10 },
        characteristicDegrees: ["b7"],
        tonicChord: { triadQuality: "major", seventhQuality: "7 (dominant)" },
        pentatonicName: "D major pentatonic",
        tones: [tone(0, "1", true), tone(2, "2", true), tone(4, "3", true), tone(5, "4", false), tone(7, "5", true), tone(9, "6", true), tone(10, "b7", false)],
        fretsByString: [[10, 12], [10, 12, 13], [9, 11, 12], [9, 10, 12], [9, 10, 12], [10, 12]]
      },
      {
        id: "e-aeolian",
        numeral: "vi",
        tonic: "E",
        tonicPitchClass: 4,
        name: "Aeolian",
        position: 5,
        accent: "#dc2626",
        anchor: { string: 6, fret: 12 },
        characteristicDegrees: ["b6"],
        tonicChord: { triadQuality: "minor", seventhQuality: "m7" },
        pentatonicName: "E minor pentatonic",
        tones: [tone(0, "1", true), tone(2, "2", false), tone(3, "b3", true), tone(5, "4", true), tone(7, "5", true), tone(8, "b6", false), tone(10, "b7", true)],
        fretsByString: [[12, 14, 15], [12, 13, 15], [11, 12, 14], [12, 14], [12, 14, 15], [12, 14, 15]]
      },
      {
        id: "fs-locrian",
        numeral: "vii°",
        tonic: "F♯",
        tonicPitchClass: 6,
        name: "Locrian",
        position: 1,
        accent: "#0284c7",
        anchor: { string: 6, fret: 2 },
        characteristicDegrees: ["b5", "b2"],
        tonicChord: { triadQuality: "diminished", seventhQuality: "m7♭5 (half-diminished)" },
        pentatonicName: "F♯ Locrian-compatible pentatonic",
        pentatonicNote: "Project-defined subset: 1 ♭3 4 ♭5 ♭7",
        tones: [tone(0, "1", true), tone(1, "b2", false), tone(3, "b3", true), tone(5, "4", true), tone(6, "b5", true), tone(8, "b6", false), tone(10, "b7", true)],
        fretsByString: [[2, 3, 5], [3, 5], [2, 4, 5], [2, 4, 5], [2, 3, 5], [2, 3, 5]]
      }
    ]
  };
}));
