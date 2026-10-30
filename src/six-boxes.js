(function runSixBoxes() {
  "use strict";
  const data = window.GuitarDiagramData;
  const engine = window.GuitarSixBoxes;
  const storageKey = "guitar-diagrams-six-boxes-v1";
  const controls = Object.fromEntries(["tonic", "box", "palette", "labels"].map((name) => [name, document.getElementById(`six-${name}`)]));
  const status = document.getElementById("six-status");
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(storageKey) || "{}"); } catch (_) { /* Use defaults. */ }
  const params = new URLSearchParams(location.search);
  const fromUrl = Object.fromEntries(Object.keys(controls).filter((key) => params.has(key)).map((key) => [key, params.get(key)]));
  let settings = engine.normalize({ ...saved, ...fromUrl });
  for (const key of data.majorKeys) controls.tonic.add(new Option(`${key.tonic} major`, key.pitchClass));

  function render() {
    const c = engine.context(data, settings);
    controls.box.replaceChildren(new Option("All 6 positions", "all"), ...c.boxes.map((box) => new Option(engine.boxName(box), box.id)));
    for (const [key, control] of Object.entries(controls)) control.value = settings[key];
    document.getElementById("six-frame").innerHTML = engine.render(data, settings);
    const box = c.boxes.find((b) => b.id === settings.box);
    document.getElementById("six-summary").textContent = box
      ? `${c.key.tonic} major · ${engine.boxName(box)} · ${box.finger} on string ${box.string}, fret ${box.rootFret}. ${engine.paletteNames[settings.palette]}: ${settings.palette === "scale" ? c.key.notes.join(" · ") : (settings.palette === "triad" ? [0, 2, 4] : [0, 1, 2, 4, 5]).map((i) => c.key.notes[i]).join(" · ")}.`
      : `${c.key.tonic} major · Six positions around two bass-string roots. Choose a colored position below to isolate it, then switch from scale to pentatonic to triad.`;
    document.getElementById("six-positions").replaceChildren(...c.boxes.map((b) => {
      const button = document.createElement("button");
      button.type = "button";
      button.style.setProperty("--box-color", b.color);
      button.setAttribute("aria-pressed", String(settings.box === b.id));
      const title = document.createElement("strong");
      title.textContent = engine.boxName(b);
      const detail = document.createElement("small");
      detail.textContent = `${b.form} · root fret ${b.rootFret} · ${b.finger.toLowerCase()}`;
      button.append(title, detail);
      button.addEventListener("click", () => update({ box: settings.box === b.id ? "all" : b.id }));
      return button;
    }));
  }

  function update(changes) {
    settings = engine.normalize({ ...settings, ...changes });
    render();
    status.textContent = "";
    try { localStorage.setItem(storageKey, JSON.stringify(settings)); }
    catch (_) { status.textContent = "Browser saving is unavailable. Your selections still work for this visit."; }
    try { history.replaceState(null, "", `?${new URLSearchParams(settings)}`); } catch (_) { /* file:// may restrict history. */ }
  }
  for (const [key, control] of Object.entries(controls)) control.addEventListener("change", () => update({ [key]: control.value }));
  document.getElementById("six-next-key").addEventListener("click", () => update({ tonic: (settings.tonic + 7) % 12 }));
  document.getElementById("six-print").addEventListener("click", () => window.print());
  document.getElementById("six-export").addEventListener("click", () => {
    const key = data.majorKeys.find((k) => k.pitchClass === settings.tonic).tonic.toLowerCase().replace("♯", "s").replace("♭", "b");
    const url = URL.createObjectURL(new Blob([engine.render(data, settings)], { type: "image/svg+xml;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${key}-six-boxes-${settings.box}-${settings.palette}-${settings.labels}.svg`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = "Downloaded the six-box diagram as SVG.";
  });
  render();
}());
