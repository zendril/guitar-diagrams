(function exposeCircleRenderer(root, factory) {
  const renderer = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = renderer;
  if (root) root.GuitarCircleRenderer = renderer;
}(typeof globalThis !== "undefined" ? globalThis : this, function buildCircleRenderer() {
  "use strict";
  const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const point = (radius, angle) => {
    const radians = (angle - 90) * Math.PI / 180;
    return [radius * Math.cos(radians), radius * Math.sin(radians)].map((value) => Number(value.toFixed(3)));
  };
  function wedge(inner, outer, index) {
    const start = index * 30 - 15;
    const end = start + 30;
    return `M ${point(outer, start)} A ${outer} ${outer} 0 0 1 ${point(outer, end)} L ${point(inner, end)} A ${inner} ${inner} 0 0 0 ${point(inner, start)} Z`;
  }
  function label(radius, index, text, className, offset = 0) {
    const [x, y] = point(radius, index * 30);
    return `<text x="${x}" y="${y + offset}" class="${className}" text-anchor="middle" dominant-baseline="middle">${escape(text)}</text>`;
  }

  function render(engine, settings) {
    const c = engine.context(settings);
    const segments = c.segments.map((segment) => {
      const k = segment.key;
      const majorDegree = segment.majorChord?.numeral || "";
      const minorDegree = segment.minorChord?.numeral || "";
      // Rare spellings (C♯ / C♭) retain the familiar circle name alongside the actual chord.
      const minorRole = segment.minorChord && segment.minorChord.name !== k.relativeMinor
        ? `${minorDegree} · ${segment.minorChord.name}` : minorDegree;
      return `<g class="fifths-key${segment.selected ? " is-selected" : ""}" role="button" tabindex="${segment.selected ? 0 : -1}" aria-pressed="${segment.selected}" aria-label="${escape(`${k.tonic} major, ${k.relativeMinor} relative minor, ${engine.signatureDescription(k)}`)}" data-key="${escape(k.id)}" style="--key-color:${segment.color}">
        <path class="fifths-major${majorDegree ? " is-family" : ""}" d="${wedge(228, 300, segment.index)}" />
        <path class="fifths-minor${minorDegree ? " is-family" : ""}" data-drone-root="minor" d="${wedge(158, 228, segment.index)}" />
        <path class="fifths-signature" d="${wedge(93, 158, segment.index)}" />
        ${label(266, segment.index, k.tonic, "fifths-major-name", majorDegree ? -8 : 0)}
        ${majorDegree ? label(266, segment.index, majorDegree, "fifths-ring-degree", 17) : ""}
        ${label(194, segment.index, k.relativeMinor, "fifths-minor-name", minorDegree ? -8 : 0)}
        ${minorDegree ? label(194, segment.index, minorRole, `fifths-ring-degree fifths-minor-degree${minorRole !== minorDegree ? " is-enharmonic" : ""}`, 15) : ""}
        ${label(126, segment.index, engine.signatureLabel(k), "fifths-signature-name")}
        <path class="fifths-selection-outline" d="${wedge(93, 300, segment.index)}" />
      </g>`;
    }).join("");
    const degrees = c.circleChords.map((chord) => `<g class="fifths-degree-box fifths-degree-${chord.quality}" data-degree="${escape(chord.numeral)}" data-chord="${chord.degree}" aria-hidden="true">
      <path d="${wedge(307, 368, chord.index)}" />
      ${label(338, chord.index, chord.numeral, "fifths-outer-degree", -9)}
      ${label(338, chord.index, chord.name.replace("dim", "°"), "fifths-outer-chord", 15)}
    </g>`).join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-378 -378 756 756" role="group" aria-labelledby="fifths-svg-title fifths-svg-desc">
      <title id="fifths-svg-title">Circle of fifths: ${escape(c.key.tonic)} major and ${escape(c.key.relativeMinor)}</title>
      <desc id="fifths-svg-desc">Major keys on the outer ring, relative minors in the middle, and key signature counts inside. Select a slice to see its major-key chords. Playback mode chooses a root tone or full triad. Use arrow keys to move around the circle, Enter or Space to play the major key, or M for its relative minor. The chord buttons above also play the selected root or triad.</desc>
      ${segments}${degrees}
      <g class="fifths-center" aria-hidden="true">
        <text x="0" y="-33" class="fifths-center-caption">SELECTED KEY</text>
        <text x="0" y="3" class="fifths-center-key">${escape(c.key.tonic)} major</text>
        <text x="0" y="32" class="fifths-center-minor">${escape(c.key.relativeMinor)} relative minor</text>
        <text x="0" y="58" class="fifths-center-signature">${escape(engine.signatureLabel(c.key))}</text>
      </g>
    </svg>`;
  }
  return { render };
}));
