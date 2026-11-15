(function runCircleOfFifths() {
  "use strict";
  const engine = window.GuitarCircleOfFifths;
  const renderer = window.GuitarCircleRenderer;
  const storageKey = "guitar-diagrams-circle-of-fifths-v1";
  const keyControl = document.getElementById("fifths-key");
  const frame = document.getElementById("fifths-frame");
  const respell = document.getElementById("fifths-respell");
  const chordStrip = document.getElementById("fifths-chords");
  const droneToggle = document.getElementById("fifths-drone-toggle");
  const droneStatus = document.getElementById("fifths-drone-status");
  let playbackMode = "root";
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(storageKey) || "{}"); } catch (_) { /* Use C major. */ }
  const params = new URLSearchParams(location.search);
  let settings = engine.normalize(params.has("key") ? { key: params.get("key") } : saved);
  let droneTarget = rootTarget(engine.context(settings).key);
  const drone = window.GuitarDroneAudio.create({ onChange: renderAudio });
  for (const key of engine.keys) keyControl.add(new Option(`${key.tonic} major / ${key.relativeMinor}`, key.id));

  function rootTarget(key, minor = false) {
    return { pitchClass: (key.pitchClass + (minor ? 9 : 0)) % 12,
      note: minor ? key.notes[5] : key.tonic, label: minor ? key.relativeMinor : `${key.tonic} major`,
      quality: minor ? "minor" : "major", notes: (minor ? [5, 0, 2] : [0, 2, 4]).map((index) => key.notes[index]) };
  }

  function renderAudio(state = drone.getState()) {
    const chordMode = playbackMode === "chord";
    const sound = chordMode ? "chord" : "drone";
    const labels = { idle: `Play ${sound}`, starting: "Mute", playing: "Mute", muted: "Unmute", paused: `Resume ${sound}`, error: "Retry audio" };
    droneToggle.textContent = labels[state.status];
    droneToggle.dataset.state = state.status;
    const message = state.status === "error" ? "Audio unavailable — retry or use another browser."
      : state.status === "idle" ? (chordMode ? "Chord ready" : "Drone ready")
      : `${state.status === "playing" ? (state.volume ? "Playing" : "Volume at 0% ·") : state.status === "starting" ? "Starting" : state.muted ? "Muted ·" : "Paused ·"} ${chordMode ? `${droneTarget.label} chord · ${droneTarget.notes.join("–")}` : `${droneTarget.note} drone (${droneTarget.label})`}`;
    if (droneStatus.textContent !== message) droneStatus.textContent = message;
    document.getElementById("fifths-audio-help").textContent = chordMode
      ? "Click a key, relative minor, or chord to sustain its full triad."
      : "Click a key, relative minor, or chord to sustain its root note.";
    document.getElementById("fifths-drone-volume-value").textContent = `${state.volume}%`;
    document.getElementById("fifths-drone-volume").value = state.volume;
    document.querySelectorAll('input[name="fifths-sound-mode"]').forEach((control) => { control.checked = control.value === playbackMode; });
    chordStrip.querySelectorAll("[data-pitch]").forEach((card) => {
      const qualityMatches = !chordMode || card.dataset.quality === state.quality;
      card.classList.toggle("is-droning", state.status === "playing" && state.volume > 0 && Number(card.dataset.pitch) === state.pitchClass && qualityMatches);
      const chordLabel = `${card.dataset.note} ${card.dataset.quality}`;
      card.setAttribute("aria-label", `${card.dataset.numeral}: ${chordLabel}. Play ${chordMode ? `${chordLabel} chord` : `${card.dataset.note} drone`}`);
      card.title = chordMode ? `Play a sustained ${chordLabel} chord` : `Play a sustained ${card.dataset.note} root note`;
    });
  }

  function playTarget(target) {
    droneTarget = target;
    void drone.play(target.pitchClass, playbackMode === "chord" ? target.quality : "root");
  }

  function playChord(degree) {
    const chord = engine.context(settings).chords.find((item) => item.degree === Number(degree));
    if (chord) playTarget({ pitchClass: chord.pitchClass, note: chord.root, label: chord.name, quality: chord.quality, notes: chord.notes });
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  }

  function render() {
    const c = engine.context(settings);
    keyControl.value = c.key.id;
    document.getElementById("fifths-heading").textContent = `Chords in ${c.key.tonic} major`;
    frame.innerHTML = renderer.render(engine, settings);
    chordStrip.replaceChildren(...c.circleChords.map((chord) => {
      const card = element("button", `fifths-chord fifths-chord-${chord.quality}`, "");
      card.type = "button";
      card.dataset.chord = chord.degree;
      card.dataset.pitch = chord.pitchClass;
      card.dataset.quality = chord.quality;
      card.dataset.note = chord.root;
      card.dataset.numeral = chord.numeral;
      card.style.setProperty("--chord-color", chord.color);
      const top = element("div", "fifths-chord-top", "");
      top.append(element("span", "fifths-chord-degree", chord.numeral), element("span", "fifths-quality", chord.symbol));
      card.append(top, element("strong", "fifths-chord-name", chord.name.replace("dim", "°")));
      return card;
    }));
    document.getElementById("fifths-relative-title").textContent = `${c.key.tonic} major & ${c.key.notes[5]} minor`;
    document.getElementById("fifths-signature-summary").textContent = engine.signatureDescription(c.key);
    document.getElementById("fifths-accidentals").textContent = c.key.accidentals.length ? c.key.accidentals.join(" · ") : "All natural notes";
    const alternative = engine.sectors[c.key.index].keys.find((key) => key.id !== c.key.id);
    respell.hidden = !alternative;
    respell.textContent = alternative ? `Use ${alternative.tonic} / ${alternative.relativeMinor} spelling` : "";
    respell.dataset.key = alternative?.id || "";
    document.getElementById("fifths-pairs").replaceChildren(...[[3, 1], [0, 5], [4, 2]].map(([major, minor]) => {
      const pair = element("div", "fifths-pair", "");
      const majorChord = c.chords[major];
      const minorChord = c.chords[minor];
      pair.append(element("strong", "", `${majorChord.name}  ${majorChord.numeral}`), element("span", "fifths-pair-arrow", "↔"), element("strong", "", `${minorChord.name}  ${minorChord.numeral}`));
      return pair;
    }));
    const enharmonicNote = document.getElementById("fifths-enharmonic-note");
    enharmonicNote.hidden = !c.enharmonicReferences.length;
    enharmonicNote.textContent = `Same pitches on the circle: ${c.enharmonicReferences.join("; ")}.`;
    document.getElementById("fifths-scale").replaceChildren(...c.chords.map((chord) => {
      const item = element("div", "", "");
      item.append(element("span", "", chord.numeral), element("strong", "", chord.name));
      return item;
    }));
    const diminished = c.chords[6];
    document.getElementById("fifths-diminished").textContent = `${diminished.name} is the vii° chord: ${diminished.notes.join("–")}. It completes the seven-chord family.`;
    document.getElementById("fifths-announcement").textContent = `${c.key.tonic} major, relative minor ${c.key.relativeMinor}. ${engine.signatureDescription(c.key)}. Chords: ${c.chords.map((chord) => chord.name).join(", ")}.`;
    renderAudio();
  }

  function update(changes, focusCircle = false, minor = false) {
    settings = engine.normalize({ ...settings, ...changes });
    render();
    try { localStorage.setItem(storageKey, JSON.stringify(settings)); } catch (_) { /* The page still works without storage. */ }
    try {
      const url = new URL(location.href);
      url.searchParams.set("key", settings.key);
      history.replaceState(null, "", url);
    } catch (_) { /* Some file:// browsers restrict history. */ }
    if (focusCircle) frame.querySelector('[aria-pressed="true"]').focus({ preventScroll: true });
    playTarget(rootTarget(engine.context(settings).key, minor));
  }

  keyControl.addEventListener("change", () => update({ key: keyControl.value }));
  respell.addEventListener("click", () => update({ key: respell.dataset.key }));
  document.getElementById("fifths-previous").addEventListener("click", () => update(engine.neighbor(settings, -1)));
  document.getElementById("fifths-next").addEventListener("click", () => update(engine.neighbor(settings, 1)));
  frame.addEventListener("click", (event) => {
    const chord = event.target.closest("[data-chord]");
    if (chord) { playChord(chord.dataset.chord); return; }
    const target = event.target.closest("[data-key]");
    if (target) update({ key: target.dataset.key }, true, Boolean(event.target.closest('[data-drone-root="minor"]')));
  });
  frame.addEventListener("keydown", (event) => {
    if (!event.target.closest("[data-key]")) return;
    const steps = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (Object.hasOwn(steps, event.key)) {
      event.preventDefault();
      update(engine.neighbor(settings, steps[event.key]), true);
    } else if (["Enter", " ", "Home", "End", "m", "M"].includes(event.key)) {
      event.preventDefault();
      update({ key: event.key === "Home" ? "C" : event.key === "End" ? "F" : event.target.closest("[data-key]").dataset.key }, true, event.key.toLowerCase() === "m");
    }
  });
  chordStrip.addEventListener("click", (event) => {
    const chord = event.target.closest("[data-chord]");
    if (chord) playChord(chord.dataset.chord);
  });
  droneToggle.addEventListener("click", () => {
    const state = drone.getState();
    if (state.muted) void drone.setMuted(false);
    else if (state.status === "playing" || state.status === "starting") drone.setMuted(true);
    else playTarget(droneTarget);
  });
  document.getElementById("fifths-drone-volume").addEventListener("input", (event) => drone.setVolume(event.target.value));
  document.querySelectorAll('input[name="fifths-sound-mode"]').forEach((control) => {
    control.addEventListener("change", () => {
      playbackMode = control.value;
      // Changing mode retunes an active selection, while idle stays silent and mute stays on.
      if (drone.getState().status === "idle") renderAudio();
      else playTarget(droneTarget);
    });
  });
  window.addEventListener("pagehide", () => drone.stop());
  window.addEventListener("pageshow", () => renderAudio());
  render();
}());
