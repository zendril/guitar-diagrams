"use strict";
const assert = require("node:assert/strict");
const audio = require("../src/drone-audio.js");

function fakeContext(initialState = "running") {
  const pending = [];
  const parameter = () => ({ value: 0,
    setValueAtTime(value) { this.value = value; },
    setTargetAtTime(value) { this.value = value; } });
  return {
    state: initialState, currentTime: 0, destination: {}, voices: [], gains: [], resumes: 0,
    createOscillator() {
      const voice = { frequency: parameter(), connect(output) { this.output = output; }, disconnect() { this.disconnected = true; }, start() { this.started = true; }, stop() { this.stopped = true; } };
      this.voices.push(voice);
      return voice;
    },
    createGain() {
      const gain = { gain: parameter(), connect() {}, disconnect() { this.disconnected = true; } };
      this.gains.push(gain);
      return gain;
    },
    resume() { this.resumes++; return new Promise((resolve) => pending.push(resolve)); },
    finishResume() {
      if (this.state !== "closed") this.state = "running";
      this.onstatechange?.();
      pending.splice(0).forEach((resolve) => resolve());
    },
    close() { this.state = "closed"; return Promise.resolve(); }
  };
}

(async () => {
  assert(Math.abs(audio.frequency(0) - 130.81278265) < .0001, "C3 reference tuning");
  assert.equal(audio.frequency(9), 220, "A3 reference tuning");
  assert.deepEqual(audio.voicing(0, "major"), [0, 4, 7]);
  assert.deepEqual(audio.voicing(9, "minor"), [9, 12, 16], "A minor's C and E sit above A");
  assert.deepEqual(audio.voicing(11, "diminished"), [11, 14, 17]);
  let created = 0;
  const context = fakeContext();
  const drone = audio.create({ createContext: () => { created++; return context; } });
  assert.equal(created, 0, "Loading a page must not create or start audio");
  assert.equal(drone.getState().status, "idle");
  await drone.play(0);
  assert.equal(drone.getState().status, "playing");
  assert.equal(context.voices.length, 1);
  assert(context.voices[0].started);
  assert(context.gains[0].gain.value > 0 && context.gains[0].gain.value < .1, "Conservative initial volume");
  await drone.play(9);
  assert.equal(context.voices.length, 1, "Changing keys must not stack sustained voices");
  assert.equal(context.voices[0].frequency.value, 220);
  drone.setMuted(true);
  assert.equal(context.gains[0].gain.value, 0);
  await drone.play(7);
  assert.equal(context.gains[0].gain.value, 0, "Clicking another key must respect mute");
  assert.equal(drone.getState().status, "muted");
  await drone.setMuted(false);
  assert.equal(context.voices[0].frequency.value, audio.frequency(7), "Unmute uses the latest selected pitch");
  drone.setVolume(0);
  assert.equal(context.gains[0].gain.value, 0);
  drone.setVolume(150);
  assert.equal(drone.getState().volume, 100);
  assert.equal(context.gains[0].gain.value, .18, "Volume has a bounded maximum");
  drone.setMuted(true);
  drone.setVolume(50);
  assert.equal(context.gains[0].gain.value, 0, "Volume adjustments must not unmute");
  drone.stop();
  assert.equal(context.state, "closed");
  assert(context.voices[0].stopped && context.voices[0].disconnected);
  assert(context.gains[0].disconnected);

  const harmony = fakeContext();
  const chordDrone = audio.create({ createContext: () => harmony });
  const sounding = () => harmony.voices.filter((voice) => voice.output.gain.value > 0 && !voice.stopped);
  const checkFrequencies = (expected) => {
    assert.equal(sounding().length, expected.length);
    sounding().forEach((voice, index) => assert(Math.abs(voice.frequency.value - expected[index]) < .0001));
  };
  await chordDrone.play(0, "major");
  checkFrequencies([130.81278265, 164.81377846, 195.99771799]);
  await chordDrone.play(9, "minor");
  checkFrequencies([220, 261.62556530, 329.62755691]);
  await chordDrone.play(11, "diminished");
  checkFrequencies([246.94165063, 293.66476792, 349.22823143]);
  assert.equal(harmony.voices.length, 3, "Changing chords reuses the three voices");
  assert.equal(sounding().reduce((sum, voice) => sum + voice.output.gain.value, 0), 1, "Chord mix is normalized to the root mix");
  await chordDrone.play(9);
  checkFrequencies([220]);
  assert.equal(harmony.voices.length, 3, "Returning to Root silences extra voices without accumulating new ones");
  chordDrone.setMuted(true);
  await chordDrone.play(0, "major");
  assert.equal(harmony.gains[0].gain.value, 0, "Switching to Chord must not unmute");
  assert.equal(chordDrone.getState().quality, "major");
  await chordDrone.setMuted(false);
  checkFrequencies([130.81278265, 164.81377846, 195.99771799]);
  chordDrone.setMuted(true);
  await chordDrone.play(9);
  assert.equal(harmony.gains[0].gain.value, 0, "Switching to Root must not unmute");
  await chordDrone.setMuted(false);
  checkFrequencies([220]);
  chordDrone.stop();
  assert(harmony.voices.every((voice) => voice.stopped && voice.disconnected));
  assert(harmony.gains.every((gain) => gain.disconnected), "Leaving the page releases every voice and gain");

  const delayed = fakeContext("suspended");
  const pendingDrone = audio.create({ createContext: () => delayed });
  const first = pendingDrone.play(0);
  const second = pendingDrone.play(9);
  delayed.finishResume();
  await Promise.all([first, second]);
  assert.equal(delayed.voices.length, 1);
  assert.equal(delayed.voices[0].frequency.value, 220, "A delayed startup plays only the newest selection");

  const delayedChord = fakeContext("suspended");
  const changingMode = audio.create({ createContext: () => delayedChord });
  const rootStart = changingMode.play(0);
  const majorStart = changingMode.play(0, "major");
  const minorStart = changingMode.play(9, "minor");
  delayedChord.finishResume();
  await Promise.all([rootStart, majorStart, minorStart]);
  assert.equal(delayedChord.voices.length, 3);
  assert.equal(changingMode.getState().quality, "minor");
  assert.deepEqual(delayedChord.voices.map((voice) => Math.round(voice.frequency.value)), [220, 262, 330], "Latest mode and chord win a delayed audio startup");

  for (const interrupt of ["mute", "leave"]) {
    const delayedContext = fakeContext("suspended");
    const interrupted = audio.create({ createContext: () => delayedContext });
    const starting = interrupted.play(0, "major");
    if (interrupt === "mute") interrupted.setMuted(true);
    else interrupted.stop();
    delayedContext.finishResume();
    await starting;
    assert.equal(delayedContext.voices.length, 0, `${interrupt} prevents a pending startup from sounding`);
    assert.notEqual(interrupted.getState().status, "playing");
  }
  const unsupported = audio.create({ createContext: () => { throw new Error("Unavailable"); } });
  await unsupported.play(0);
  assert.equal(unsupported.getState().status, "error", "Unavailable audio is recoverable and reported");
  await assert.rejects(unsupported.play(-1), RangeError);
  await assert.rejects(unsupported.play(0, "constructor"), RangeError);
  console.log("Verified root and triad tuning, ascending voicings, normalized mixing, mode switches, mute persistence, cleanup, and delayed-start races.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
