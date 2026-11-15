(function expose(root, factory) {
  const render = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = render;
  if (root) root.GuitarPlaygroundRender = render;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const point = (r, index) => [r * Math.sin(index * Math.PI / 6), -r * Math.cos(index * Math.PI / 6)].map((v) => Number(v.toFixed(3)));
  const wedge = (inner, outer, index) => `M ${point(outer, index - .5)} A ${outer} ${outer} 0 0 1 ${point(outer, index + .5)} L ${point(inner, index + .5)} A ${inner} ${inner} 0 0 0 ${point(inner, index - .5)} Z`;
  const text = (radius, index, value, cls, dy = 0) => {
    const [x, y] = point(radius, index);
    return `<text x="${x}" y="${y + dy}" class="${cls}">${escape(value)}</text>`;
  };
  function degrees(engine, circleContext, selected) {
    return circleContext.circleChords.map((base) => ({ index: base.index, degree: base.degree,
      chord: base.pitchClass === selected.pitchClass ? selected : engine.parseChord(base.name) }));
  }
  function wheel(engine, circleContext, selected) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-360 -360 720 720" role="group" aria-labelledby="pg-wheel-title pg-wheel-desc">
      <title id="pg-wheel-title">Chord explorer in ${escape(circleContext.key.tonic)} major</title>
      <desc id="pg-wheel-desc">Choose a chord root around the circle of fifths. The outer boxes show chord degrees in the home key. Arrows move by fifths, Enter plays the root with your selected variation, and M selects its relative minor.</desc>
      ${circleContext.segments.map((segment) => `<g role="button" tabindex="${segment.key.pitchClass === selected.pitchClass ? 0 : -1}" class="pg-slice${segment.key.pitchClass === selected.pitchClass ? " is-selected" : ""}" aria-pressed="${segment.key.pitchClass === selected.pitchClass}" aria-label="${escape(segment.key.tonic)} root, ${escape(segment.key.relativeMinor)} relative minor" data-root="${escape(segment.key.tonic)}" style="--slice:${segment.color}">
        <path class="pg-root-sector" d="${wedge(193, 273, segment.index)}" />
        <path class="pg-minor-sector" data-minor="${escape(segment.key.notes[5])}" d="${wedge(133, 193, segment.index)}" />
        ${text(234, segment.index, segment.key.tonic, "pg-root-name")}
        ${text(164, segment.index, segment.key.relativeMinor, "pg-minor-name")}
        <path class="pg-selection" d="${wedge(133, 273, segment.index)}" />
      </g>`).join("")}
      ${degrees(engine, circleContext, selected).map((entry) => `<g class="pg-degree" role="button" tabindex="0" data-degree="${entry.degree}" aria-label="${escape(engine.numeral(entry.chord, circleContext.key))}: ${escape(entry.chord.label)}">
        <path d="${wedge(282, 348, entry.index)}" />
        ${text(315, entry.index, engine.numeral(entry.chord, circleContext.key), "pg-degree-name", -10)}
        ${text(315, entry.index, entry.chord.label, "pg-degree-chord", 15)}
      </g>`).join("")}
      <g class="pg-wheel-center" aria-hidden="true"><text y="-38" class="pg-center-caption">HOME KEY · ${escape(circleContext.key.tonic)} MAJOR</text><text y="5" class="pg-center-name">${escape(selected.label)}</text><text y="40" class="pg-center-degree">${escape(engine.numeral(selected, circleContext.key))}</text><text y="72" class="pg-center-caption">${escape(selected.notes.map(engine.display).join(" · "))}</text></g>
    </svg>`;
  }
  return { wheel, degrees };
}));
