(function runPlayground() {
  "use strict";
  const engine = window.GuitarChordPlayground, circle = window.GuitarCircleOfFifths, renderer = window.GuitarPlaygroundRender;
  const $ = (id) => document.getElementById(`pg-${id}`);
  const storageKey = "guitar-diagrams-chord-playground-v1";
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(storageKey) || "{}"); } catch (_) { /* Start with the blues. */ }
  if (!saved || typeof saved !== "object") saved = {};
  let home = circle.context({ key: saved.home }).key;
  let selected;
  try { selected = engine.chord(saved.root || "C", saved.quality || "7", saved.inversion || 0); }
  catch (_) { selected = engine.chord("C", "7"); }
  let editing = null;
  $("progression").value = typeof saved.text === "string" ? saved.text : engine.preset("blues", home);
  let parsed = engine.parse($("progression").value);
  const initial = engine.options(saved);
  for (const id of ["home", "transpose-key"]) for (const key of circle.keys) $(id).add(new Option(`${key.tonic} major`, key.id));
  for (const root of engine.roots) $("root").add(new Option(engine.display(root), root));
  for (const preset of engine.presets) $("preset").add(new Option(preset.label, preset.id));
  for (const pattern of engine.patterns) $("pattern").add(new Option(pattern.label, pattern.id));
  $("home").value = $("transpose-key").value = home.id;
  $("bpm").value = initial.bpm; $("pattern").value = initial.pattern;
  for (const key of ["loop", "countIn", "metronome"]) $(key === "countIn" ? "count-in" : key).checked = initial[key];
  const player = window.GuitarPlaygroundAudio.create(engine, { onState: renderTransport, onTick: renderPosition });

  function node(tag, className, text) {
    const result = document.createElement(tag); result.className = className; result.textContent = text; return result;
  }
  function options() {
    return engine.options({ bpm: $("bpm").value, pattern: $("pattern").value, loop: $("loop").checked, countIn: $("count-in").checked, metronome: $("metronome").checked });
  }
  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ home: home.id, root: selected.root, quality: selected.quality, inversion: selected.inversion,
        text: $("progression").value, ...options(), volume: player.state().volume, muted: player.state().muted }));
      $("save-status").textContent = "Your progression and settings are saved in this browser.";
    } catch (_) { $("save-status").textContent = "Browser saving is unavailable. You can still use the playground and copy your progression text."; }
  }
  function renderBuilder() {
    if (![...$("root").options].some((option) => option.value === selected.root)) $("root").add(new Option(engine.display(selected.root), selected.root));
    $("root").value = selected.root;
    $("chord-name").textContent = selected.label;
    $("numeral").textContent = engine.numeral(selected, home);
    $("notes").replaceChildren(...selected.voicedNotes.map((note) => node("span", "", engine.display(note))));
    $("formula").textContent = `${selected.type.formula}${selected.inversion ? ` · ${engine.display(selected.voicedNotes[0])} in the bass` : " · root position"}`;
    $("inversion").replaceChildren(...selected.notes.map((note, index) => new Option(index === 0 ? "Root position" : `${["", "1st", "2nd", "3rd", "4th"][index]} · ${engine.display(note)} bass`, index)));
    $("inversion").value = selected.inversion;
    $("qualities").replaceChildren(...engine.qualities.map((type) => {
      const button = node("button", "", type.label); button.type = "button"; button.dataset.quality = type.id;
      button.setAttribute("aria-pressed", String(selected.quality === type.id));
      return button;
    }));
    $("wheel").innerHTML = renderer.wheel(engine, circle.context({ key: home.id }), selected);
    $("add").textContent = $("length").value === "4" ? "Add bar" : `Add ${$("length").value} beats`;
    $("replace").disabled = !parsed.ok || editing === null;
    $("edit-label").textContent = parsed.ok && editing !== null
      ? `Editing bar ${parsed.events[editing].barIndex + 1}: ${parsed.events[editing].chord.label}.`
      : "Select a chord tile below to edit it.";
  }
  function choose(value, audition = true, focus = false) {
    selected = value; renderBuilder(); save();
    if (focus) $("wheel").querySelector('.pg-slice[aria-pressed="true"]').focus({ preventScroll: true });
    if (audition) void player.audition(selected);
  }
  function renderSequence() {
    parsed = engine.parse($("progression").value);
    $("progression").setAttribute("aria-invalid", String(!parsed.ok));
    $("errors").hidden = parsed.ok;
    $("errors").replaceChildren(...parsed.errors.map((error) => node("p", "", error)));
    $("summary").textContent = parsed.ok ? `${parsed.bars.length} bars · ${parsed.totalBeats} beats` : "Check the sequence";
    $("bars").replaceChildren(...parsed.bars.map((events, index) => {
      const bar = node("div", "pg-bar", ""); bar.dataset.bar = index;
      const header = node("div", "pg-bar-header", ""); header.append(node("span", "", `BAR ${index + 1}`), node("span", "", "4 beats"));
      const chords = node("div", "pg-bar-chords", "");
      for (const event of events) {
        const button = node("button", "", ""); button.type = "button"; button.dataset.event = event.index; button.style.setProperty("--beats", event.beats);
        button.setAttribute("aria-label", `Bar ${index + 1}: ${event.chord.label}, ${event.beats} beats. Edit chord`);
        button.setAttribute("aria-pressed", String(editing === event.index));
        button.append(node("strong", "", event.chord.label), node("small", "", `${engine.numeral(event.chord, home)} · ${event.beats} beats`)); chords.append(button);
      }
      bar.append(header, chords, node("div", "pg-bar-progress", "")); return bar;
    }));
    renderBuilder(); renderTransport();
    if (player.state().status === "playing") renderPosition({ beat: player.state().position, cycle: 0 });
    else renderPosition({ beat: null });
  }
  function editText(text) {
    player.stop(); $("progression").value = text; editing = null; renderSequence(); save();
  }
  function renderTransport(state = player.state()) {
    const running = state.status === "playing" || state.status === "starting";
    $("play").textContent = state.status === "playing" ? "Pause" : state.status === "starting" ? "Cancel start" : state.status === "paused" ? "Resume" : "Play progression";
    $("play").disabled = !parsed.ok && !running;
    $("audition").textContent = state.status === "auditioning" ? "Stop chord" : "Play chord";
    $("mute").textContent = state.muted ? "Unmute" : "Mute";
    $("mute").setAttribute("aria-pressed", String(state.muted));
    $("volume").value = state.volume; $("volume-value").textContent = `${state.volume}%`;
    for (const id of ["bpm", "pattern", "loop", "count-in", "metronome"]) $(id).disabled = running;
    for (const id of ["down", "up", "transpose"]) $(id).disabled = !parsed.ok;
    $("status").textContent = `${state.muted ? "Muted · " : ""}${state.message}`;
  }
  function renderPosition({ beat, cycle = 0 }) {
    const counting = beat !== null && beat < 0;
    const current = beat !== null && !counting && parsed.ok ? parsed.events.find((event) => beat >= event.startBeat && beat < event.startBeat + event.beats) : null;
    const barIndex = current?.barIndex;
    $("position").textContent = counting ? `Count-in · ${Math.min(4, Math.floor(beat + 4) + 1)} / 4`
      : current ? `Bar ${barIndex + 1} / ${parsed.bars.length} · Beat ${Math.floor(beat % 4) + 1} / 4${cycle ? ` · Loop ${cycle + 1}` : ""}` : "Ready · 4/4";
    $("current").textContent = counting ? "Get ready" : current?.chord.label || "—";
    const next = current ? (parsed.events[current.index + 1] || (options().loop ? parsed.events[0] : null)) : parsed.events[0];
    $("next").textContent = `Next: ${next?.chord.label || "—"}`;
    document.querySelectorAll(".pg-beats span").forEach((span, i) => span.classList.toggle("is-active", beat !== null && i === (counting ? Math.floor(beat + 4) : Math.floor(beat % 4))));
    $("bars").querySelectorAll("[data-bar]").forEach((bar) => {
      const active = Number(bar.dataset.bar) === barIndex;
      if (active) bar.setAttribute("aria-current", "step"); else bar.removeAttribute("aria-current");
      bar.style.setProperty("--progress", active ? `${(beat % 4) * 25}%` : "0%");
    });
    $("bars").querySelectorAll("[data-event]").forEach((button) => button.classList.toggle("is-playing", current?.index === Number(button.dataset.event)));
  }
  function transpose(target) {
    if (!parsed.ok) return;
    const events = parsed.events.map((event) => ({ ...event, chord: engine.transposeKey(event.chord, home, target) }));
    selected = engine.transposeKey(selected, home, target); home = target;
    $("home").value = $("transpose-key").value = target.id; editText(engine.format(events));
  }
  $("home").addEventListener("change", () => { home = circle.context({ key: $("home").value }).key; $("transpose-key").value = home.id; renderSequence(); save(); });
  $("root").addEventListener("change", () => choose(engine.chord($("root").value, selected.quality, selected.inversion)));
  $("inversion").addEventListener("change", () => choose(engine.chord(selected.root, selected.quality, Number($("inversion").value))));
  $("qualities").addEventListener("click", (event) => {
    const button = event.target.closest("[data-quality]");
    if (button) { choose(engine.chord(selected.root, button.dataset.quality)); $("qualities").querySelector(`[data-quality="${selected.quality}"]`).focus({ preventScroll: true }); }
  });
  function chooseWheel(target, minor = false) {
    const degree = target.closest("[data-degree]");
    if (degree) {
      const match = renderer.degrees(engine, circle.context({ key: home.id }), selected).find((entry) => entry.degree === Number(degree.dataset.degree));
      choose(match.chord, true, true); return;
    }
    const slice = target.closest("[data-root]");
    if (!slice) return;
    const minorRoot = target.closest("[data-minor]")?.dataset.minor;
    const relative = minorRoot || circle.context({ key: home.id }).segments.find((segment) => segment.key.pitchClass === engine.pitch(slice.dataset.root)).key.notes[5];
    const useMinor = Boolean(minorRoot || minor);
    choose(engine.chord(useMinor ? relative : slice.dataset.root, useMinor ? "min" : selected.quality, useMinor ? 0 : selected.inversion), true, true);
  }
  $("wheel").addEventListener("click", (event) => chooseWheel(event.target));
  $("wheel").addEventListener("keydown", (event) => {
    if (["Enter", " ", "m", "M"].includes(event.key)) { event.preventDefault(); chooseWheel(event.target, event.key.toLowerCase() === "m"); }
    else if (event.target.closest("[data-root]") && ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key)) {
      event.preventDefault(); const direction = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1;
      const target = circle.context({ key: home.id }).segments.find((segment) => segment.key.pitchClass === engine.mod(selected.pitchClass + direction * 7));
      choose(engine.chord(target.key.tonic, selected.quality, selected.inversion), true, true);
    }
  });
  $("length").addEventListener("change", renderBuilder);
  $("audition").addEventListener("click", () => { if (["auditioning", "starting"].includes(player.state().status)) player.stop(); else void player.audition(selected); });
  $("add").addEventListener("click", () => editText(`${$("progression").value.trim()} ${engine.token(selected, Number($("length").value))}`.trim()));
  $("replace").addEventListener("click", () => {
    if (!parsed.ok || editing === null) return;
    const event = parsed.events[editing], text = $("progression").value;
    editText(text.slice(0, event.start) + engine.token(selected, Number($("length").value)) + text.slice(event.end));
  });
  $("bars").addEventListener("click", (event) => {
    const button = event.target.closest("[data-event]"); if (!button) return;
    editing = Number(button.dataset.event); selected = parsed.events[editing].chord; $("length").value = parsed.events[editing].beats;
    renderBuilder(); $("bars").querySelectorAll("[data-event]").forEach((tile) => tile.setAttribute("aria-pressed", String(Number(tile.dataset.event) === editing))); save();
  });
  $("progression").addEventListener("input", () => { player.stop(); editing = null; renderSequence(); save(); });
  $("load-preset").addEventListener("click", () => editText(engine.preset($("preset").value, home)));
  $("transpose").addEventListener("click", () => transpose(circle.context({ key: $("transpose-key").value }).key));
  for (const [id, delta] of [["down", -1], ["up", 1]]) $(id).addEventListener("click", () => transpose(circle.keys.find((key) => key.pitchClass === engine.mod(home.pitchClass + delta))));
  $("play").addEventListener("click", () => {
    const state = player.state();
    if (state.status === "playing") player.pause();
    else if (state.status === "starting") player.stop();
    else if (parsed.ok) void player.play(parsed, options(), state.status === "paused");
  });
  $("stop").addEventListener("click", () => player.stop());
  $("mute").addEventListener("click", () => { player.setMuted(!player.state().muted); save(); });
  $("volume").addEventListener("input", () => { player.setVolume($("volume").value); save(); });
  for (const id of ["bpm", "pattern", "loop", "count-in", "metronome"]) $(id).addEventListener("change", () => { $("bpm").value = options().bpm; save(); });
  window.addEventListener("pagehide", () => player.dispose());
  window.addEventListener("pageshow", () => renderTransport());
  renderSequence();
  player.setVolume(Number.isFinite(saved.volume) ? saved.volume : 25);
  player.setMuted(saved.muted === true);
}());
