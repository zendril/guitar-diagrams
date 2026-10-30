(function expose(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.GuitarSixBoxes = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function build() {
  "use strict";

  // Fret offsets from the named bass-string root; rows run high e to low E.
  // Checked against Fret Science MY1F4-id64k, 1:53–4:45 (A major).
  // The front pentatonics are diagonal routes, NOT filtered 3NPS shapes.
  const shapes = [
    { id: "e-behind", string: 6, placement: "Behind", form: "G-form", finger: "Little finger", time: 113,
      scale: [[-3,-1,0],[-3,-2,0],[-4,-3,-1],[-3,-1],[-3,-1,0],[-3,-1,0]] },
    { id: "e-straddling", string: 6, placement: "Straddling", form: "E-form", finger: "Middle finger", time: 146,
      scale: [[-1,0,2],[0,2],[-1,1,2],[-1,1,2],[-1,0,2],[-1,0,2]] },
    { id: "e-front", string: 6, placement: "In front", form: "3NPS / diagonal", finger: "Index finger", time: 173,
      scale: [[2,4,5],[2,4,5],[1,2,4],[1,2,4],[0,2,4],[0,2,4]],
      pentatonic: [[7,9],[5,7,9],[4,6],[2,4,6],[2,4],[0,2,4]] },
    { id: "a-behind", string: 5, placement: "Behind", form: "C-form", finger: "Little finger", time: 217,
      scale: [[-3,-2,0],[-3,-2,0],[-3,-1],[-3,-1,0],[-3,-1,0],[-3,-2,0]] },
    { id: "a-straddling", string: 5, placement: "Straddling", form: "A-form", finger: "Middle finger", time: 237,
      scale: [[0,2],[0,2,3],[-1,1,2],[-1,0,2],[-1,0,2],[0,2]] },
    { id: "a-front", string: 5, placement: "In front", form: "3NPS / diagonal", finger: "Index finger", time: 258,
      scale: [[2,4,5],[2,3,5],[1,2,4],[0,2,4],[0,2,4],[0,2,4]],
      pentatonic: [[5,7,9],[5,7],[2,4,6],[2,4],[0,2,4],[0,2]] }
  ];
  const colors = ["#2563eb", "#7c3aed", "#059669", "#b45309", "#dc2626", "#0284c7"];
  const offsets = [0, 2, 4, 5, 7, 9, 11];
  const palettes = { scale: offsets, pentatonic: [0, 2, 4, 7, 9], triad: [0, 4, 7] };
  const paletteNames = { scale: "Major scale", pentatonic: "Major pentatonic", triad: "Major triad arpeggio" };
  const mod = (value) => (value % 12 + 12) % 12;

  function normalize(input = {}) {
    const tonic = Number(input.tonic);
    return {
      tonic: input.tonic !== null && input.tonic !== "" && Number.isInteger(tonic) && tonic >= 0 && tonic < 12 ? tonic : 9,
      box: shapes.some((s) => s.id === input.box) ? input.box : "all",
      palette: Object.hasOwn(palettes, input.palette) ? input.palette : "scale",
      labels: input.labels === "notes" ? "notes" : "intervals"
    };
  }

  function context(data, input) {
    const settings = normalize(input);
    const key = data.majorKeys.find((k) => k.pitchClass === settings.tonic);
    // Keep complete movable shapes on the neck; near-nut roots may need an octave.
    const roots = { 6: mod(settings.tonic - 4), 5: mod(settings.tonic - 9) };
    if (roots[6] < 4) roots[6] += 12;
    if (roots[5] < 3) roots[5] += 12;
    const boxes = shapes.map((shape) => {
      const rootFret = roots[shape.string];
      const geometry = settings.palette !== "scale" && shape.pentatonic ? shape.pentatonic : shape.scale;
      const fretsByString = geometry.map((frets, i) => frets.map((f) => f + rootFret)
        .filter((f) => palettes[settings.palette].includes(mod(data.strings[i].openPitchClass + f - settings.tonic))));
      return { ...shape, rootFret, fretsByString };
    }).sort((a, b) => a.rootFret - b.rootFret);
    // Stable sort preserves behind → straddling → front within each root group.
    boxes.forEach((box, i) => { box.number = i + 1; box.color = colors[i]; });
    const minFret = Math.min(...boxes.flatMap((b) => b.fretsByString.flat()));
    const maxFret = Math.max(...boxes.flatMap((b) => b.fretsByString.flat()));
    const entries = data.strings.flatMap((string, i) => {
      const result = [];
      for (let fret = minFret; fret <= maxFret; fret++) {
        const interval = mod(string.openPitchClass + fret - settings.tonic);
        if (!palettes[settings.palette].includes(interval)) continue;
        const degree = offsets.indexOf(interval) + 1;
        const members = boxes.filter((box) => box.fretsByString[i].includes(fret)).map((box) => box.id);
        result.push({ string: string.number, stringIndex: i, fret, degree, note: key.notes[degree - 1],
          root: interval === 0, core: palettes.pentatonic.includes(interval), members,
          active: settings.box === "all" ? members.length > 0 : members.includes(settings.box) });
      }
      return result;
    });
    return { settings, key, boxes, minFret, maxFret, entries };
  }

  const esc = (text) => String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
  const boxName = (box) => `${box.number}. ${box.string === 6 ? "E" : "A"}-root · ${box.placement}`;

  function render(data, input) {
    const c = context(data, input);
    const { settings, boxes, minFret, maxFret } = c;
    const left = 76, right = 1404, top = 140, gap = 34;
    const cell = (right - left) / (maxFret - minFret + 1);
    const x = (f) => left + (f - minFret + 0.5) * cell;
    const y = (i) => top + i * gap;
    const selected = boxes.find((b) => b.id === settings.box);
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1480 510" width="1480" height="510" role="img" aria-labelledby="six-title six-desc" data-palette="${settings.palette}" data-box="${settings.box}">`
      + `<title id="six-title">${esc(c.key.tonic)} ${paletteNames[settings.palette]} · six boxes</title>`
      + `<desc id="six-desc">${selected ? esc(boxName(selected)) : "All six positions"}. High e at top; low E at bottom. Rings mark tonics; orange rings mark the two bass-string root anchors. ${boxes.map((b) => esc(`${boxName(b)}, root at string ${b.string} fret ${b.rootFret}`)).join(". ")}.</desc>`
      + `<style>text{font-family:Inter,Segoe UI,Arial,sans-serif;fill:#111827}.title{font-size:25px;font-weight:700}.caption{font-size:15px;fill:#5b6472}.label{font-size:12px;text-anchor:middle}.degree{font-size:12px;font-weight:700;text-anchor:middle;dominant-baseline:middle}.contour{fill:none;stroke-linejoin:round;stroke-width:3}.note{stroke:#111827;stroke-width:1.5}.legend{font-size:14px;font-weight:600}</style>`
      + `<rect width="1480" height="510" fill="white"/>`
      + `<text class="title" x="76" y="35">${esc(c.key.tonic)} major · How the six boxes connect</text>`
      + `<text class="caption" x="76" y="63">${paletteNames[settings.palette]} · ${selected ? esc(boxName(selected)) : "All six positions"} · ${settings.labels === "notes" ? "Note names" : "Intervals from the tonic"}</text>`
      + `<text class="caption" x="76" y="88">${settings.palette === "scale" ? "Filled = pentatonic core; hollow = 4 and 7. Front shapes use three notes per string." : "Front shapes follow the lesson’s diagonal pentatonic route; triads retain 1, 3 and 5."}</text>`;
    for (let f = minFret; f <= maxFret + 1; f++) {
      const xx = left + (f - minFret) * cell;
      svg += `<line x1="${xx}" x2="${xx}" y1="122" y2="328" stroke="#b7bec9"/>`;
      if (f <= maxFret) svg += `<text class="label" x="${x(f)}" y="115">${f === 0 ? "0 (open)" : f}</text>`;
    }
    data.strings.forEach((s, i) => {
      svg += `<line x1="${left}" x2="${right}" y1="${y(i)}" y2="${y(i)}" stroke="#6b7280" stroke-width="${1 + i * 0.25}"/>`
        + `<text class="label" x="42" y="${y(i) + 4}">${s.number} · ${s.name}</text>`;
    });
    // Separate contour lanes keep overlapping boundaries visible.
    boxes.filter((b) => b.id !== settings.box).concat(selected ? [selected] : []).forEach((b) => {
      const pad = 15 + (b.number % 3) * 3;
      const rows = b.fretsByString.map((frets, i) => ({ lo: x(Math.min(...frets)) - pad, hi: x(Math.max(...frets)) + pad, yy: y(i) }));
      const points = [];
      rows.forEach((r) => points.push([r.lo, r.yy - gap/2], [r.lo, r.yy + gap/2]));
      [...rows].reverse().forEach((r) => points.push([r.hi, r.yy + gap/2], [r.hi, r.yy - gap/2]));
      const active = !selected || selected.id === b.id;
      svg += `<path class="contour" data-shape="${b.id}" d="M${points.map((p) => p.join(",")).join(" L")} Z" stroke="${b.color}" opacity="${active ? 0.9 : 0.16}"/>`;
    });
    c.entries.forEach((n) => {
      const anchor = boxes.some((b) => b.string === n.string && b.rootFret === n.fret);
      const filled = n.core || settings.palette !== "scale";
      svg += `<g data-string="${n.string}" data-fret="${n.fret}" data-degree="${n.degree}" data-active="${n.active}" opacity="${n.active ? 1 : 0.18}" transform="translate(${x(n.fret)} ${y(n.stringIndex)})">`
        + `<title>String ${n.string}, fret ${n.fret}, ${esc(n.note)}, degree ${n.degree}${anchor ? ", bass root anchor" : ""}</title>`
        + (n.root ? `<circle r="16" fill="white" stroke="${anchor ? "#b45309" : "#059669"}" stroke-width="2.5"/>` : "")
        + `<circle class="note" r="12" fill="${filled ? "#111827" : "white"}"/>`
        + `<text class="degree" style="fill:${filled ? "white" : "#111827"}">${esc(settings.labels === "notes" ? n.note : n.degree)}</text></g>`;
    });
    boxes.forEach((b, i) => {
      const xx = 76 + (i % 3) * 445, yy = 387 + Math.floor(i / 3) * 43;
      svg += `<rect x="${xx}" y="${yy - 12}" width="21" height="15" rx="3" fill="${b.color}"/>`
        + `<text class="legend" x="${xx + 30}" y="${yy}">${esc(boxName(b))} · ${esc(b.form)}</text>`;
    });
    svg += `<text class="caption" x="76" y="480">Root anchors: E string, fret ${boxes.find((b) => b.string === 6).rootFret} · A string, fret ${boxes.find((b) => b.string === 5).rootFret}. Green rings = tonic; orange rings = bass anchors.</text></svg>`;
    return svg;
  }
  return { normalize, context, render, boxName, paletteNames };
}));
