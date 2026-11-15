(function exposeDroneAudio(root, factory) {
  const audio = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = audio;
  if (root) root.GuitarDroneAudio = audio;
}(typeof globalThis !== "undefined" ? globalThis : this, function buildDroneAudio() {
  "use strict";

  // Roots sit in C3–B3; chord tones ascend from the root instead of wrapping down.
  // No audio is created on page load.
  const frequency = (semitones) => 440 * 2 ** ((48 + semitones - 69) / 12);
  const intervals = { root: [0], major: [0, 4, 7], minor: [0, 3, 7], diminished: [0, 3, 6] };

  function voicing(pitchClass, quality = "root") {
    if (!Number.isInteger(pitchClass) || pitchClass < 0 || pitchClass > 11) throw new RangeError("Invalid drone pitch");
    if (!Object.hasOwn(intervals, quality)) throw new RangeError("Invalid chord quality");
    return intervals[quality].map((interval) => pitchClass + interval);
  }

  function create({ createContext = () => {
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Audio) throw new Error("Web Audio is unavailable");
    return new Audio();
  }, onChange = () => {} } = {}) {
    let context, gain;
    let voices = [];
    let generation = 0;
    let pitchClass = null;
    let quality = "root";
    let muted = false;
    let volume = 25;
    let status = "idle";

    function getState() {
      return { pitchClass, quality, muted, volume,
        status: status === "playing" && context?.state !== "running" ? "paused" : status };
    }
    const notify = () => onChange(getState());
    function adjustVolume() {
      if (gain) gain.gain.setTargetAtTime(muted ? 0 : .18 * volume / 100, context.currentTime, .012);
    }
    function release() {
      for (const voice of voices) {
        const { oscillator, gain: voiceGain } = voice;
        try { oscillator.stop(); } catch (_) { /* It may not have started if setup failed. */ }
        oscillator.disconnect();
        voiceGain.disconnect();
      }
      if (gain) gain.disconnect();
      if (context) {
        context.onstatechange = null;
        if (context.state !== "closed") void context.close().catch(() => {});
      }
      voices = [];
      context = gain = undefined;
    }
    async function play(nextPitch, nextQuality = "root") {
      const tones = voicing(nextPitch, nextQuality);
      pitchClass = nextPitch;
      quality = nextQuality;
      const request = ++generation;
      if (muted) { status = "muted"; notify(); return; }
      status = "starting";
      notify();
      try {
        if (!context || context.state === "closed") {
          release();
          context = createContext();
          context.onstatechange = notify;
        }
        const activeContext = context;
        if (activeContext.state !== "running") await activeContext.resume();
        // Mute, another selection, or leaving the page can supersede a pending resume.
        if (request !== generation || muted || activeContext !== context) return;
        if (activeContext.state !== "running") throw new Error("Audio could not start");
        if (!gain) {
          gain = context.createGain();
          gain.gain.setValueAtTime(0, context.currentTime);
          gain.connect(context.destination);
        }
        while (voices.length < tones.length) {
          const oscillator = context.createOscillator();
          const voiceGain = context.createGain();
          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(frequency(tones[voices.length]), context.currentTime);
          voiceGain.gain.setValueAtTime(0, context.currentTime);
          oscillator.connect(voiceGain);
          voiceGain.connect(gain);
          voices.push({ oscillator, gain: voiceGain });
          oscillator.start();
        }
        // Reuse at most three voices. Normalize the mix to the root-only volume,
        // fading unused voices out when switching back to a single root.
        voices.forEach((voice, index) => {
          if (index < tones.length) voice.oscillator.frequency.setTargetAtTime(frequency(tones[index]), context.currentTime, .018);
          voice.gain.gain.setTargetAtTime(index < tones.length ? 1 / tones.length : 0, context.currentTime, .012);
        });
        adjustVolume();
        status = "playing";
        notify();
      } catch (_) {
        if (request !== generation) return;
        release();
        status = "error";
        notify();
      }
    }
    function setMuted(value) {
      muted = Boolean(value);
      ++generation;
      if (!muted && pitchClass !== null) return play(pitchClass, quality);
      adjustVolume();
      status = muted ? "muted" : "idle";
      notify();
    }
    function setVolume(value) {
      if (!Number.isFinite(Number(value))) return;
      volume = Math.min(100, Math.max(0, Number(value)));
      adjustVolume();
      notify();
    }
    function stop() {
      ++generation;
      release();
      status = muted ? "muted" : "idle";
      notify();
    }
    return { play, setMuted, setVolume, stop, getState };
  }
  return { create, frequency, voicing };
}));
