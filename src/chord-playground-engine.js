(function expose(root, factory) {
  const engine = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = engine;
  if (root) root.GuitarChordPlayground = engine;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const mod = (n) => (n % 12 + 12) % 12;
  const letters = ["C", "D", "E", "F", "G", "A", "B"];
  const naturals = [0, 2, 4, 5, 7, 9, 11];
  const qualities = [
    { id: "maj", label: "Major", suffix: "", intervals: [0, 4, 7], degrees: [1, 3, 5], formula: "1 · 3 · 5" },
    { id: "min", label: "Minor", suffix: "m", intervals: [0, 3, 7], degrees: [1, 3, 5], formula: "1 · ♭3 · 5" },
    { id: "7", label: "Dominant 7", suffix: "7", intervals: [0, 4, 7, 10], degrees: [1, 3, 5, 7], formula: "1 · 3 · 5 · ♭7" },
    { id: "maj7", label: "Major 7", suffix: "maj7", intervals: [0, 4, 7, 11], degrees: [1, 3, 5, 7], formula: "1 · 3 · 5 · 7" },
    { id: "m7", label: "Minor 7", suffix: "m7", intervals: [0, 3, 7, 10], degrees: [1, 3, 5, 7], formula: "1 · ♭3 · 5 · ♭7" },
    { id: "sus4", label: "Sus 4", suffix: "sus4", intervals: [0, 5, 7], degrees: [1, 4, 5], formula: "1 · 4 · 5" },
    { id: "dim", label: "Diminished", suffix: "dim", intervals: [0, 3, 6], degrees: [1, 3, 5], formula: "1 · ♭3 · ♭5" },
    { id: "sus2", label: "Sus 2", suffix: "sus2", intervals: [0, 2, 7], degrees: [1, 2, 5], formula: "1 · 2 · 5" },
    { id: "add9", label: "Add 9", suffix: "add9", intervals: [0, 4, 7, 14], degrees: [1, 3, 5, 9], formula: "1 · 3 · 5 · 9" },
    { id: "9", label: "Dominant 9", suffix: "9", intervals: [0, 4, 7, 10, 14], degrees: [1, 3, 5, 7, 9], formula: "1 · 3 · 5 · ♭7 · 9" },
    { id: "m7b5", label: "Minor 7 ♭5", suffix: "m7b5", intervals: [0, 3, 6, 10], degrees: [1, 3, 5, 7], formula: "1 · ♭3 · ♭5 · ♭7" }
  ];
  const aliases = { "": "maj", maj: "maj", major: "maj", M: "maj", m: "min", min: "min", minor: "min", "7": "7", dom7: "7", maj7: "maj7", M7: "maj7", "Δ7": "maj7", m7: "m7", min7: "m7", minor7: "m7", sus: "sus4", sus4: "sus4", sus2: "sus2", dim: "dim", "°": "dim", add9: "add9", "9": "9", m7b5: "m7b5", "ø": "m7b5", "ø7": "m7b5" };
  const roots = letters.flatMap((letter) => [letter, `${letter}#`, `${letter}b`]);
  const display = (text) => text.replaceAll("#", "♯").replaceAll("b", "♭");
  function normalizeRoot(value) {
    const text = String(value).replaceAll("♯", "#").replaceAll("♭", "b");
    if (!/^[A-Ga-g](?:#+|b+)?$/.test(text)) throw new Error(`Unrecognized root “${value}”.`);
    return text[0].toUpperCase() + text.slice(1);
  }
  function pitch(root) {
    root = normalizeRoot(root);
    return mod(naturals[letters.indexOf(root[0])] + [...root].filter((c) => c === "#").length - [...root].filter((c) => c === "b").length);
  }
  function spell(root, interval, degree) {
    const letter = letters[(letters.indexOf(root[0]) + degree - 1) % 7];
    let accidental = mod(pitch(root) + interval - naturals[letters.indexOf(letter)]);
    if (accidental > 6) accidental -= 12;
    return letter + (accidental < 0 ? "b".repeat(-accidental) : "#".repeat(accidental));
  }
  function chord(root, quality = "maj", inversion = 0) {
    root = normalizeRoot(root);
    const type = qualities.find((q) => q.id === quality);
    if (!type) throw new Error(`Unrecognized chord type “${quality}”.`);
    if (!Number.isInteger(inversion) || inversion < 0 || inversion >= type.intervals.length) throw new Error("Choose an available inversion.");
    const notes = type.intervals.map((interval, i) => spell(root, interval, type.degrees[i]));
    const bassInterval = type.intervals[inversion];
    const voiced = type.intervals.map((interval, i) => {
      while (interval < bassInterval) interval += 12;
      return { midi: 48 + pitch(root) + interval, note: notes[i] };
    }).sort((a, b) => a.midi - b.midi);
    const symbol = root + type.suffix + (inversion ? `/${notes[inversion]}` : "");
    return { root, quality, inversion, type, pitchClass: pitch(root), symbol, label: display(symbol), notes,
      midi: voiced.map((tone) => tone.midi), voicedNotes: voiced.map((tone) => tone.note) };
  }
  function parseChord(text) {
    const match = /^([A-Ga-g](?:#+|b+)?)([^/]*)(?:\/([A-Ga-g](?:#+|b+)?))?$/.exec(text.replaceAll("♯", "#").replaceAll("♭", "b"));
    if (!match || !Object.hasOwn(aliases, match[2])) throw new Error(`Unrecognized chord “${text}”. Try C, Cm, C7, Cmaj7, Cm7, Csus4, Cdim, Csus2, Cadd9, C9, or Cm7b5.`);
    let result = chord(match[1], aliases[match[2]]);
    if (match[3]) {
      const inversion = result.notes.findIndex((note) => pitch(note) === pitch(match[3]));
      if (inversion < 0) throw new Error(`The bass in “${text}” must be a chord tone: ${result.notes.map(display).join(", ")}.`);
      result = chord(result.root, result.quality, inversion);
    }
    return result;
  }
  function parse(text) {
    text = String(text);
    const events = [], errors = [], bars = [];
    let totalBeats = 0;
    if (text.length > 16000) return { ok: false, errors: ["Keep the progression under 16,000 characters."], events, bars, totalBeats };
    for (const token of text.matchAll(/\||[^\s|]+/g)) {
      const raw = token[0];
      if (raw === "|") {
        if (totalBeats % 4) errors.push(`Bar ${Math.floor(totalBeats / 4) + 1} needs ${4 - totalBeats % 4} more beats before |.`);
        continue;
      }
      try {
        const pieces = raw.split(":");
        if (pieces.length > 2 || (pieces.length === 2 && !/^[1-4]$/.test(pieces[1]))) throw new Error(`Use :1, :2, :3, or :4 for the beat length in “${raw}”.`);
        const beats = pieces.length === 2 ? Number(pieces[1]) : 4;
        const value = parseChord(pieces[0]);
        if (totalBeats % 4 + beats > 4) throw new Error(`“${raw}” crosses a bar line. Bar ${Math.floor(totalBeats / 4) + 1} has ${4 - totalBeats % 4} beats left.`);
        const event = { chord: value, beats, startBeat: totalBeats, barIndex: Math.floor(totalBeats / 4), start: token.index, end: token.index + raw.length, index: events.length };
        events.push(event);
        totalBeats += beats;
        if (events.length > 1024 || totalBeats > 1024) throw new Error("Use at most 256 bars in one progression.");
      } catch (error) { errors.push(error.message); }
      if (errors.length >= 6 || totalBeats > 1024) break;
    }
    if (!events.length && !errors.length) errors.push("Enter a progression or load a preset to start.");
    if (totalBeats % 4) errors.push(`Bar ${Math.floor(totalBeats / 4) + 1} needs ${4 - totalBeats % 4} more beats. Each bar must total 4.`);
    if (!errors.length) for (const event of events) (bars[event.barIndex] ||= []).push(event);
    return { ok: !errors.length, events, bars, errors: [...new Set(errors)], totalBeats };
  }
  const token = (value, beats = 4) => value.symbol + (beats === 4 ? "" : `:${beats}`);
  function format(events) {
    let beats = 0;
    return events.map((event, i) => {
      const prefix = i ? (beats % 16 === 0 ? "\n" : beats % 4 === 0 ? " | " : " ") : "";
      beats += event.beats;
      return prefix + token(event.chord, event.beats);
    }).join("");
  }
  function numeral(value, key) {
    const degree = (letters.indexOf(value.root[0]) - letters.indexOf(key.id[0]) + 7) % 7;
    let alteration = mod(value.pitchClass - key.pitchClass - naturals[degree]);
    if (alteration > 6) alteration -= 12;
    let result = (alteration < 0 ? "♭".repeat(-alteration) : "♯".repeat(alteration)) + ["I", "II", "III", "IV", "V", "VI", "VII"][degree];
    if (["min", "m7", "dim", "m7b5"].includes(value.quality)) result = result.toLowerCase();
    const suffix = { maj: "", min: "", "7": "7", maj7: "maj7", m7: "7", dim: "°", m7b5: "ø7" };
    return result + (Object.hasOwn(suffix, value.quality) ? suffix[value.quality] : value.type.suffix);
  }
  function transpose(value, semitones, flats = false) {
    const names = flats ? ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] : ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    return chord(names[mod(value.pitchClass + semitones)], value.quality, value.inversion);
  }
  function transposeKey(value, from, to) {
    const degree = (letters.indexOf(value.root[0]) - letters.indexOf(from.id[0]) + 7) % 7 + 1;
    return chord(spell(to.id, mod(value.pitchClass - from.pitchClass), degree), value.quality, value.inversion);
  }
  const presets = [
    { id: "blues", label: "12-bar blues", text: "C7 C7 C7 C7 F7 F7 C7 C7 G7 F7 C7 C7" },
    { id: "turnaround", label: "Blues · V7 turnaround", text: "C7 C7 C7 C7 F7 F7 C7 C7 G7 F7 C7 G7" },
    { id: "251", label: "Major ii–V–I", text: "Dm7 G7 Cmaj7 Cmaj7" },
    { id: "minor251", label: "Minor ii–V–i", text: "Dm7b5 G7 Cm7 Cm7" },
    { id: "pop", label: "Pop · I–V–vi–IV", text: "C G Am F" },
    { id: "split251", label: "ii–V–I · shared bar", text: "Dm7:2 G7:2 Cmaj7" }
  ];
  function preset(id, key) {
    const source = presets.find((p) => p.id === id) || presets[0];
    return format(parse(source.text).events.map((event) => ({ ...event, chord: transposeKey(event.chord, { id: "C", pitchClass: 0 }, key) })));
  }
  const patterns = [
    { id: "hold", label: "Hold each chord" }, { id: "down", label: "Down strums · quarter notes" },
    { id: "alternate", label: "Down / up · eighth notes" }, { id: "pop", label: "Pop strum · D – D U – U D U" }
  ];
  function options(value = {}) {
    return { bpm: Math.max(40, Math.min(240, Math.round(Number(value.bpm) || 90))),
      pattern: patterns.some((p) => p.id === value.pattern) ? value.pattern : "hold",
      loop: value.loop !== false, countIn: value.countIn !== false, metronome: value.metronome === true };
  }
  function schedule(parsed, settings) {
    if (!parsed.ok) throw new Error("Correct the progression before playback.");
    const opt = options(settings), queue = [];
    for (const event of parsed.events) {
      let strokes = [{ offset: 0, direction: "block" }];
      if (opt.pattern !== "hold") {
        const grid = opt.pattern === "down" ? [0, 1, 2, 3] : opt.pattern === "pop" ? [0, 1, 1.5, 2.5, 3, 3.5] : [0, .5, 1, 1.5, 2, 2.5, 3, 3.5];
        strokes = grid.filter((offset) => offset < event.beats).map((offset) => ({ offset, direction: offset % 1 ? "up" : "down" }));
      }
      strokes.forEach((stroke, index) => {
        const available = (strokes[index + 1]?.offset ?? event.beats) - stroke.offset;
        queue.push({ kind: "chord", beat: event.startBeat + stroke.offset, duration: available * (opt.pattern === "hold" ? 1 : .85), midi: event.chord.midi, direction: stroke.direction, eventIndex: event.index });
      });
    }
    if (opt.metronome) for (let beat = 0; beat < parsed.totalBeats; beat++) queue.push({ kind: "click", beat, accent: beat % 4 === 0 });
    if (opt.countIn) for (let beat = -4; beat < 0; beat++) queue.push({ kind: "click", beat, accent: beat === -4 });
    return queue.sort((a, b) => a.beat - b.beat || (a.kind === "click" ? -1 : 1));
  }
  return { qualities, roots, display, pitch, chord, parseChord, parse, token, format, numeral, transpose, transposeKey, presets, preset, patterns, options, schedule, mod };
}));
