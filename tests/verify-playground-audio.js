"use strict";
const assert = require("node:assert/strict");
const engine = require("../src/chord-playground-engine.js");
const audio = require("../src/chord-playground-audio.js");
const near = (actual, expected, label) => assert(Math.abs(actual - expected) < .000001, `${label}: ${actual} vs ${expected}`);

function harness(initialState = "running") {
  const pending = [], ticks = [], states = [];
  let interval, created = 0;
  const parameter = () => ({ value: 0, events: [],
    setValueAtTime(value, time) { this.value = value; this.events.push({ type: "set", value, time }); },
    linearRampToValueAtTime(value, time) { this.value = value; this.events.push({ type: "ramp", value, time }); },
    setTargetAtTime(value, time) { this.value = value; this.events.push({ type: "target", value, time }); },
    cancelScheduledValues(time) { this.events = this.events.filter((event) => event.time < time); }
  });
  const context = {
    state: initialState, currentTime: 0, destination: {}, voices: [], gains: [],
    createGain() { const gain = { gain: parameter(), connect() {}, disconnect() { this.disconnected = true; } }; this.gains.push(gain); return gain; },
    createOscillator() {
      const voice = { frequency: parameter(), stops: [],
        connect(gain) { this.output = gain; }, disconnect() { this.disconnected = true; },
        start(time) { this.startTime = time; },
        stop(time) { assert.notEqual(this.startTime, undefined, "Start must be called before Stop"); this.stops.push(time); }
      };
      this.voices.push(voice); return voice;
    },
    resume() { return new Promise((resolve) => pending.push(resolve)); },
    finishResume() { if (this.state !== "closed") this.state = "running"; this.onstatechange?.(); pending.splice(0).forEach((resolve) => resolve()); },
    close() { this.state = "closed"; return Promise.resolve(); }
  };
  const player = audio.create(engine, { createContext: () => { created++; return context; },
    every(fn) { interval = fn; return 1; }, cancel() { interval = undefined; },
    onState: (state) => states.push(state), onTick: (tick) => ticks.push(tick) });
  function advance(to, step = .025) {
    while (context.currentTime < to) {
      context.currentTime = Math.min(to, context.currentTime + step);
      interval?.();
      context.voices.forEach((voice) => {
        if (!voice.ended && voice.stops.length && voice.stops.at(-1) <= context.currentTime) { voice.ended = true; voice.onended?.(); }
      });
    }
  }
  return { player, context, advance, ticks, states, created: () => created, running: () => !!interval };
}

(async () => {
  near(audio.frequency(48), 130.8127826502993, "C3"); near(audio.frequency(69), 440, "A4");
  const audition = harness();
  assert.equal(audition.created(), 0, "Page load stays silent");
  await audition.player.audition(engine.parseChord("C7/E"));
  assert.equal(audition.player.state().status, "auditioning");
  assert.deepEqual(audition.context.voices.map((voice) => voice.frequency.value), [52, 55, 58, 60].map(audio.frequency));
  assert(audition.context.voices.every((voice) => voice.stops.length === 0), "Audition sustains until stopped");
  audition.player.setMuted(true); audition.player.setVolume(60);
  await audition.player.audition(engine.parseChord("Gm7"));
  assert.equal(audition.context.gains[0].gain.value, 0, "Mute persists through chord changes");
  audition.player.setMuted(false); near(audition.context.gains[0].gain.value, .6, "Volume restored");
  audition.player.dispose(); audition.advance(.1);
  assert.equal(audition.context.state, "closed");
  assert(audition.context.voices.every((voice) => voice.disconnected && voice.output.disconnected), "All audition nodes are released");

  const repeated = harness();
  await repeated.player.play(engine.parse("C7 C7"), { bpm: 120, loop: false, countIn: false });
  repeated.advance(4.1);
  assert.equal(repeated.context.voices.length, 8, "Repeated bars rearticulate the chord");
  near(repeated.context.voices[0].startTime, .05, "First bar"); near(repeated.context.voices[4].startTime, 2.05, "Second bar");
  assert.equal(repeated.player.state().status, "idle"); assert(!repeated.running());
  assert.match(repeated.player.state().message, /finished/);

  const looping = harness();
  await looping.player.play(engine.parse("C"), { bpm: 240, loop: true, countIn: true });
  looping.advance(3.3);
  assert.equal(looping.context.voices.filter((voice) => voice.frequency.value === audio.frequency(90) || voice.frequency.value === audio.frequency(83)).length, 4, "Count-in occurs only on the first loop");
  const roots = looping.context.voices.filter((voice) => voice.frequency.value === audio.frequency(48));
  assert.equal(roots.length, 3);
  [1.05, 2.05, 3.05].forEach((time, i) => near(roots[i].startTime, time, "Loop boundary"));
  assert(looping.ticks.some((tick) => tick.cycle === 2));
  looping.player.stop(); assert(!looping.running());

  const paused = harness();
  const progression = engine.parse("C7 F7");
  await paused.player.play(progression, { bpm: 120, loop: false, countIn: false });
  paused.advance(.8); paused.player.pause();
  near(paused.player.state().position, 1.5, "Pause retains fractional beat");
  assert(!paused.running());
  paused.advance(2);
  await paused.player.play(progression, { bpm: 60, loop: false, countIn: false }, true);
  assert.equal(paused.context.voices.length, 8, "Resume retriggers only the held chord tail");
  near(paused.context.voices[4].stops[0], 4.555, "Resumed chord uses remaining beats at the new tempo");
  paused.advance(4.6);
  near(paused.context.voices[8].startTime, 4.55, "Next chord after tempo change");
  paused.player.stop();

  const lastBar = harness();
  await lastBar.player.play(engine.parse("C"), { bpm: 120, loop: true, countIn: false });
  lastBar.advance(1); lastBar.player.pause();
  await lastBar.player.play(engine.parse("C"), { bpm: 120, loop: true, countIn: false }, true);
  lastBar.advance(2.3);
  assert(lastBar.context.voices.length >= 9, "Resuming in the last held chord still schedules the next loop");
  lastBar.player.stop();

  const strum = harness();
  await strum.player.play(engine.parse("C7"), { bpm: 120, pattern: "alternate", loop: false, countIn: false });
  strum.advance(.2);
  assert.equal(strum.context.voices.length, 8);
  assert.deepEqual(strum.context.voices.slice(0, 4).map((voice) => voice.frequency.value), [48, 52, 55, 58].map(audio.frequency));
  assert.deepEqual(strum.context.voices.slice(4, 8).map((voice) => voice.frequency.value), [58, 55, 52, 48].map(audio.frequency));
  assert(strum.context.voices[1].startTime > strum.context.voices[0].startTime, "Strums stagger their notes");
  strum.player.stop();
  const queued = strum.context.voices[4];
  assert(queued.output.gain.events.filter((event) => event.time >= .2).every((event) => event.value === 0), "Cancelled future strums cannot sound later");

  const interrupted = harness();
  await interrupted.player.play(engine.parse("C F"), { bpm: 240, loop: true, countIn: false });
  interrupted.advance(1.7, 1.7);
  assert.equal(interrupted.player.state().status, "paused", "Long scheduling gaps pause instead of firing missed chords in a burst");
  assert(!interrupted.running());

  const jitter = harness();
  await jitter.player.play(engine.parse("C F"), { bpm: 240, loop: false, countIn: false });
  jitter.advance(.7); jitter.advance(1.1, .4);
  assert.equal(jitter.player.state().status, "playing");
  assert.equal(jitter.context.voices.length, 6, "A briefly delayed timer still plays the next chord");
  near(jitter.context.voices[3].stops[0], 2.055, "A late chord still ends on the next bar line");
  jitter.player.stop();

  const suspended = harness();
  await suspended.player.play(progression, { countIn: false });
  suspended.context.state = "suspended"; suspended.context.onstatechange();
  assert.equal(suspended.player.state().status, "paused");

  for (const action of ["stop", "dispose"]) {
    const delayed = harness("suspended");
    const pending = delayed.player.play(progression, { countIn: false });
    delayed.player[action](); delayed.context.finishResume(); await pending;
    assert.equal(delayed.context.voices.length, 0, `${action} cancels delayed startup`);
    assert(!delayed.running());
  }
  const newest = harness("suspended");
  const first = newest.player.audition(engine.parseChord("C7"));
  const second = newest.player.audition(engine.parseChord("Dm7"));
  newest.player.setMuted(true); newest.context.finishResume(); await Promise.all([first, second]);
  assert.equal(newest.context.voices.length, 4, "Only the latest selection starts");
  assert.equal(newest.context.gains[0].gain.value, 0, "Muting during startup is respected");
  assert.equal(newest.context.voices[0].frequency.value, audio.frequency(50));
  newest.player.dispose();

  const invalid = harness();
  await invalid.player.play(engine.parse("C7 H7"), {});
  assert.equal(invalid.created(), 0); assert.equal(invalid.player.state().status, "error");
  const unsupported = audio.create(engine, { createContext: () => { throw new Error("Unavailable"); } });
  await unsupported.audition(engine.parseChord("C7"));
  assert.equal(unsupported.state().status, "error");
  console.log("Verified tuning, sustained chords, scheduling, rearticulation, count-in, loops, pause/resume, strums, mute, cleanup, and audio-start races.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
