(function expose(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.GuitarPlaygroundAudio = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const frequency = (midi) => 440 * 2 ** ((midi - 69) / 12);
  function create(engine, { createContext = () => {
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Audio) throw new Error("Audio is unavailable in this browser.");
    return new Audio();
  }, onState = () => {}, onTick = () => {}, every = setInterval, cancel = clearInterval } = {}) {
    let context, master, timer, generation = 0, status = "idle", message = "Ready to play.";
    let volume = 25, muted = false, parsed, settings, queue = [], cursor = 0, cycle = 0, origin = 0, position = 0, lastTick = "";
    const voices = new Set();
    const state = () => ({ status, message, muted, volume, position });
    const notify = () => onState(state());
    function level() { if (master) master.gain.setTargetAtTime(muted ? 0 : volume / 100, context.currentTime, .008); }
    function silence() {
      if (timer !== undefined) cancel(timer);
      timer = undefined;
      for (const voice of voices) {
        const now = context.currentTime;
        voice.gain.gain.cancelScheduledValues(now);
        // Future voices must stay silent when a queued start is cancelled.
        voice.gain.gain.setValueAtTime(voice.start > now ? 0 : voice.gain.gain.value, now);
        voice.gain.gain.linearRampToValueAtTime(0, now + .015);
        try { voice.oscillator.stop(now + .02); } catch (_) { /* Already stopped. */ }
      }
      voices.clear();
    }
    async function ready(request) {
      if (!context || context.state === "closed") {
        context = createContext();
        master = context.createGain();
        master.gain.value = muted ? 0 : volume / 100;
        master.connect(context.destination);
        context.onstatechange = () => { if (status === "playing" && context.state !== "running") pause("Playback paused because audio was interrupted."); };
      }
      const active = context;
      if (active.state !== "running") await active.resume();
      if (request !== generation || active !== context) return false;
      if (active.state !== "running") throw new Error("Audio could not start. Try Play again.");
      return true;
    }
    function tone(midi, start, duration, amplitude) {
      const oscillator = context.createOscillator(), gain = context.createGain();
      const voice = { oscillator, gain, start };
      oscillator.type = "sine";
      oscillator.frequency.value = frequency(midi);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(amplitude, start + .012);
      let stopTime;
      if (Number.isFinite(duration)) {
        const end = start + Math.max(.04, duration);
        gain.gain.setValueAtTime(amplitude, Math.max(start + .013, end - .025));
        gain.gain.linearRampToValueAtTime(0, end);
        stopTime = end + .005;
      }
      oscillator.connect(gain); gain.connect(master);
      voices.add(voice);
      oscillator.onended = () => { voices.delete(voice); oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(start);
      if (stopTime !== undefined) oscillator.stop(stopTime);
    }
    function sound(event, time, secondsPerBeat) {
      if (event.kind === "click") { tone(event.accent ? 90 : 83, time, .045, .1); return; }
      const notes = event.direction === "up" ? [...event.midi].reverse() : event.midi;
      const duration = event.duration * secondsPerBeat;
      const spread = event.direction === "block" ? 0 : Math.min(.018, duration / (notes.length * 5));
      notes.forEach((midi, index) => tone(midi, time + index * spread, duration - index * spread, .18 / notes.length));
    }
    function currentBeat() {
      if (!context || !settings) return position;
      const beat = (context.currentTime - origin) / (60 / settings.bpm);
      return beat < 0 ? Math.max(-4, beat) : settings.loop ? beat % parsed.totalBeats : Math.min(beat, parsed.totalBeats);
    }
    function tick() {
      if (status !== "playing") return;
      const now = context.currentTime, seconds = 60 / settings.bpm;
      position = currentBeat();
      if (!settings.loop && now >= origin + parsed.totalBeats * seconds) { stop("Progression finished."); return; }
      const next = queue[cursor];
      if (next && origin + (next.beat + cycle * parsed.totalBeats) * seconds < now - .3) {
        pause("Playback paused after a timing interruption. Press Resume to continue."); return;
      }
      while (queue[cursor]) {
        const event = queue[cursor], when = origin + (event.beat + cycle * parsed.totalBeats) * seconds;
        if (when > now + .15) break;
        const remaining = event.duration - Math.max(0, now - when) / seconds;
        if (event.kind === "click" || remaining > .02) sound({ ...event, duration: remaining }, Math.max(now, when), seconds);
        cursor++;
        if (cursor === queue.length && settings.loop) { cycle++; cursor = queue.findIndex((item) => item.beat >= 0); }
      }
      const visualCycle = Math.max(0, Math.floor((now - origin) / (parsed.totalBeats * seconds)));
      const signature = `${Math.floor(position * 8)}:${visualCycle}`;
      if (signature !== lastTick) { lastTick = signature; onTick({ beat: position, cycle: visualCycle }); }
    }
    async function play(value, opt, resume = false) {
      const from = resume && status === "paused" ? position : null;
      silence();
      const request = ++generation;
      status = "starting"; message = "Starting audio…"; notify();
      try {
        if (!value.ok) throw new Error("Correct the progression before playback.");
        parsed = value; settings = engine.options(opt); queue = engine.schedule(parsed, settings);
        if (!await ready(request)) return;
        const startBeat = from === null ? (settings.countIn ? -4 : 0) : from;
        const seconds = 60 / settings.bpm;
        origin = context.currentTime + .05 - startBeat * seconds;
        cursor = queue.findIndex((event) => event.beat >= startBeat);
        if (cursor < 0) cursor = queue.length;
        cycle = 0; position = startBeat; lastTick = "";
        if (cursor === queue.length && settings.loop) { cycle = 1; cursor = queue.findIndex((event) => event.beat >= 0); }
        // Resume the remaining part of a held chord or strum, not a whole extra bar.
        if (from !== null && from >= 0) for (const event of queue) {
          if (event.kind === "chord" && event.beat < from && event.beat + event.duration > from) {
            sound({ ...event, duration: event.beat + event.duration - from, direction: "block" }, context.currentTime + .05, seconds);
          }
        }
        status = "playing"; message = `Playing ${parsed.bars.length} bars at ${settings.bpm} BPM.`; notify();
        tick(); timer = every(tick, 25);
      } catch (error) {
        if (request !== generation) return;
        silence(); status = "error"; message = error.message; notify();
      }
    }
    function pause(reason = "Paused. Press Resume to continue.") {
      if (status !== "playing" && status !== "starting") return;
      position = status === "playing" ? currentBeat() : 0;
      ++generation; silence(); status = "paused"; message = reason; notify();
    }
    function stop(reason = "Stopped. Ready from bar 1.") {
      ++generation; silence(); position = 0; status = "idle"; message = reason; lastTick = "";
      notify(); onTick({ beat: null, cycle: 0 });
    }
    async function audition(value) {
      stop(); const request = ++generation;
      status = "starting"; message = "Starting chord…"; notify();
      try {
        if (!await ready(request)) return;
        value.midi.forEach((midi) => tone(midi, context.currentTime + .01, Infinity, .18 / value.midi.length));
        status = "auditioning"; message = `Holding ${value.label} · ${value.voicedNotes.map(engine.display).join("–")}.`; notify();
      } catch (error) {
        if (request !== generation) return;
        silence(); status = "error"; message = error.message; notify();
      }
    }
    function setVolume(value) { if (!Number.isFinite(Number(value))) return; volume = Math.max(0, Math.min(100, Number(value))); level(); notify(); }
    function setMuted(value) { muted = Boolean(value); level(); notify(); }
    function dispose() {
      stop();
      if (context) { context.onstatechange = null; void context.close().catch(() => {}); context = master = undefined; }
    }
    return { play, pause, stop, audition, setVolume, setMuted, dispose, state };
  }
  return { create, frequency };
}));
