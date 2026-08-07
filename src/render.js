(function exposeRenderer(root, factory) {
  const renderer = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = renderer;
  if (root) root.GuitarDiagramRenderer = renderer;
}(typeof globalThis !== "undefined" ? globalThis : this, function buildRenderer() {
  "use strict";

  const WIDTH = 960;
  const HEIGHT = 390;
  const PLOT = { left: 108, right: 918, top: 138, bottom: 286 };
  const COMPACT_FRETBOARD = { left: 180, right: 780 };
  const MODE_MARKER_GEOMETRY = Object.freeze({
    radius: 12,
    discStrokeWidth: 1.8,
    tonicRadius: 14,
    tonicStrokeWidth: 1.6,
    overlayStrokeWidth: 4,
    labelSize: 12,
    stringSpacing: (286 - 138) / 5
  });
  const OVERVIEW_WIDTH = 1440;
  const OVERVIEW_HEIGHT = 460;
  const OVERVIEW_PLOT = { left: 80, right: 1400, top: 145, bottom: 295 };
  const VALID_VIEWS = new Set(["full", "combined", "pentatonic"]);
  const VALID_OVERLAYS = new Set(["none", "characteristic", "triad", "seventh"]);
  const VALID_OVERVIEW_OVERLAYS = new Set(["none", "pentatonic", "characteristic", "triad", "seventh", "caged"]);
  const VALID_FRET_SPACINGS = new Set(["compact", "guitar", "wide"]);

  const esc = (value) => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

  const prettyDegree = (degree) => degree.replace(/^b/, "♭").replace(/^#/, "♯");

  const normalizeView = (view) => VALID_VIEWS.has(view) ? view : "combined";
  const normalizeOverlay = (overlay) => VALID_OVERLAYS.has(overlay) ? overlay : "none";
  const normalizeFretSpacing = (spacing) => VALID_FRET_SPACINGS.has(spacing) ? spacing : "compact";

  function modeFretGeometry(minFret, maxFret, requestedSpacing) {
    const spacing = normalizeFretSpacing(requestedSpacing);
    const fretCount = maxFret - minFret + 1;
    const left = spacing === "wide" ? PLOT.left : COMPACT_FRETBOARD.left;
    const right = spacing === "wide" ? PLOT.right : COMPACT_FRETBOARD.right;
    const availableWidth = right - left;
    const weights = Array.from({ length: fretCount }, (_, index) => spacing === "guitar"
      ? 2 ** (-(minFret + index) / 12)
      : 1);
    const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
    const widths = weights.map((weight) => availableWidth * weight / weightTotal);
    const boundaries = [left];
    for (const width of widths) boundaries.push(boundaries.at(-1) + width);
    boundaries[boundaries.length - 1] = right;
    const centers = widths.map((width, index) => boundaries[index] + width / 2);

    return {
      spacing,
      left,
      right,
      widths,
      boundaries,
      centers,
      minCellWidth: Math.min(...widths),
      xForFret: (fret) => centers[fret - minFret]
    };
  }

  function pitchClass(openPitchClass, fret) {
    return (openPitchClass + fret) % 12;
  }

  function toneFor(mode, pc) {
    const relative = (pc - mode.tonicPitchClass + 12) % 12;
    return mode.tones.find((candidate) => candidate.semitones === relative);
  }

  function collectEntries(data, mode, view) {
    return data.strings.map((string, stringIndex) => mode.fretsByString[stringIndex]
      .map((fret) => {
        const pc = pitchClass(string.openPitchClass, fret);
        const tone = toneFor(mode, pc);
        if (!tone) throw new Error(`No ${mode.name} interval for string ${string.number}, fret ${fret}`);
        return {
          string,
          stringIndex,
          fret,
          pitchClass: pc,
          note: data.pitchClassNames[pc],
          tone,
          root: pc === mode.tonicPitchClass
        };
      })
      .filter((entry) => view !== "pentatonic" || entry.tone.core));
  }

  function pathForOutline(entriesByString, xForFret, yForString, cellWidth) {
    const horizontalPadding = Math.min(22, cellWidth * 0.28);
    const verticalPadding = 18;
    const left = entriesByString.map((entries) => xForFret(Math.min(...entries.map((entry) => entry.fret))) - horizontalPadding);
    const right = entriesByString.map((entries) => xForFret(Math.max(...entries.map((entry) => entry.fret))) + horizontalPadding);
    const ys = entriesByString.map((_, index) => yForString(index));

    let path = `M ${left[0]} ${ys[0] - verticalPadding} L ${right[0]} ${ys[0] - verticalPadding}`;
    for (let index = 0; index < right.length - 1; index += 1) {
      const middle = (ys[index] + ys[index + 1]) / 2;
      path += ` L ${right[index]} ${middle} L ${right[index + 1]} ${middle}`;
    }
    path += ` L ${right.at(-1)} ${ys.at(-1) + verticalPadding}`;
    path += ` L ${left.at(-1)} ${ys.at(-1) + verticalPadding}`;
    for (let index = left.length - 1; index > 0; index -= 1) {
      const middle = (ys[index] + ys[index - 1]) / 2;
      path += ` L ${left[index]} ${middle} L ${left[index - 1]} ${middle}`;
    }
    return `${path} Z`;
  }

  function markerLabel(entry) {
    return `<text class="marker-label" x="0" y="1">${esc(prettyDegree(entry.tone.degree))}</text>`;
  }

  function pentatonicDisplayName(mode) {
    if (mode.name === "Locrian") return "Locrian-compatible pentatonic";
    return mode.tones.some((item) => item.degree === "3") ? "Major pentatonic" : "Minor pentatonic";
  }

  function overlayFor(mode, requestedOverlay) {
    const overlay = normalizeOverlay(requestedOverlay);
    if (overlay === "characteristic") {
      const degrees = [...mode.characteristicDegrees];
      return {
        id: overlay,
        degrees,
        heading: degrees.length === 1 ? "Characteristic tone" : "Characteristic tones",
        legend: "characteristic tone",
        accessible: "characteristic-tone highlight"
      };
    }

    if (overlay === "triad") {
      return {
        id: overlay,
        degrees: [mode.tones[0], mode.tones[2], mode.tones[4]].map((tone) => tone.degree),
        heading: `Tonic triad · ${mode.tonicChord.triadQuality}`,
        legend: "tonic triad",
        accessible: "tonic-triad highlight"
      };
    }

    if (overlay === "seventh") {
      return {
        id: overlay,
        degrees: [mode.tones[0], mode.tones[2], mode.tones[4], mode.tones[6]].map((tone) => tone.degree),
        heading: `Tonic seventh · ${mode.tonicChord.seventhQuality}`,
        legend: "tonic seventh",
        accessible: "tonic-seventh highlight"
      };
    }

    return { id: "none", degrees: [], heading: "", legend: "", accessible: "" };
  }

  function viewDisplayName(view) {
    if (view === "full") return "full mode, equal notes";
    if (view === "pentatonic") return "pentatonic";
    return "full mode with pentatonic emphasis";
  }

  function modeViewSummary(mode, requestedView) {
    const view = normalizeView(requestedView);
    const omitted = mode.tones.filter((item) => !item.core).map((item) => prettyDegree(item.degree)).join(" and ");
    const projectDefined = mode.pentatonicNote ? " · project-defined" : "";
    if (view === "pentatonic") return `${pentatonicDisplayName(mode)} · five-note core${projectDefined}`;
    if (view === "full") return `Mode ${mode.numeral} · all seven notes shown equally`;
    return `Mode ${mode.numeral} · pentatonic emphasized · hollow ${omitted} are modal color tones${mode.pentatonicNote ? " · project-defined core" : ""}`;
  }

  function overviewFocusMode(data, requestedFocus) {
    if (!requestedFocus || requestedFocus === "all") return null;
    return data.modes.find((mode) => mode.id === requestedFocus) || null;
  }

  function positionFamilyFor(data, position) {
    return Array.isArray(data.positionFamilies)
      ? data.positionFamilies.find((family) => family.position === position) || null
      : null;
  }

  function normalizeOverviewOverlay(requestedOverlay, legacyShowCharacteristic) {
    if (VALID_OVERVIEW_OVERLAYS.has(requestedOverlay)) return requestedOverlay;
    return legacyShowCharacteristic === false ? "none" : "characteristic";
  }

  function renderOverviewSvg(data, options = {}) {
    const focusMode = overviewFocusMode(data, options.focusMode);
    const focusId = focusMode ? focusMode.id : "all";
    const requestedView = normalizeView(options.view);
    const requestedOverlay = normalizeOverviewOverlay(options.overlay, options.showCharacteristic);
    const overviewOverlay = focusMode ? requestedOverlay : "none";
    const showFullNeckPentatonic = overviewOverlay === "pentatonic";
    const view = focusMode ? (showFullNeckPentatonic ? "pentatonic" : requestedView) : "full";
    const showCharacteristic = overviewOverlay === "characteristic";
    const focusFamily = focusMode ? positionFamilyFor(data, focusMode.position) : null;
    const modalTonicKind = overviewOverlay === "triad" || overviewOverlay === "seventh"
      ? overviewOverlay
      : null;
    const modalTonicChord = focusMode && modalTonicKind
      ? overlayFor(focusMode, modalTonicKind)
      : { degrees: [] };
    const modalTonicDegrees = new Set(modalTonicChord.degrees);
    const cagedChordFrets = new Set();
    if (overviewOverlay === "caged" && focusFamily && Array.isArray(focusFamily.chordFretsByString)) {
      focusFamily.chordFretsByString.forEach((frets, stringIndex) => {
        frets.forEach((fret) => cagedChordFrets.add(`${stringIndex}:${fret}`));
      });
    }
    const labelMode = focusMode || data.modes.find((mode) => mode.name === "Ionian") || data.modes[0];
    const allFrets = data.modes.flatMap((mode) => mode.fretsByString.flat());
    const minFret = Math.min(...allFrets);
    const maxFret = Math.max(...allFrets);
    const fretCount = maxFret - minFret + 1;
    const cellWidth = (OVERVIEW_PLOT.right - OVERVIEW_PLOT.left) / fretCount;
    const stringSpacing = (OVERVIEW_PLOT.bottom - OVERVIEW_PLOT.top) / (data.strings.length - 1);
    const xForFret = (fret) => OVERVIEW_PLOT.left + ((fret - minFret) + 0.5) * cellWidth;
    const yForString = (index) => OVERVIEW_PLOT.top + index * stringSpacing;
    const familyModes = data.modes.filter((mode, index, modes) => modes
      .findIndex((candidate) => candidate.position === mode.position) === index);
    const parentPitchClasses = new Set(data.parentScale.pitchClasses);
    const parentChordDegreeByPitchClass = new Map([
      [data.parentScale.pitchClasses[0], "1"],
      [data.parentScale.pitchClasses[2], "3"],
      [data.parentScale.pitchClasses[4], "5"]
    ]);

    const fretLines = [];
    for (let fret = minFret; fret <= maxFret + 1; fret += 1) {
      const x = OVERVIEW_PLOT.left + (fret - minFret) * cellWidth;
      fretLines.push(`<line class="overview-fret${fret === 12 ? " landmark" : ""}" x1="${x}" y1="${OVERVIEW_PLOT.top - 20}" x2="${x}" y2="${OVERVIEW_PLOT.bottom + 20}"/>`);
    }

    const fretLabels = [];
    for (let fret = minFret; fret <= maxFret; fret += 1) {
      fretLabels.push(`<text class="overview-fret-label${fret === 12 ? " landmark" : ""}" x="${xForFret(fret)}" y="${OVERVIEW_PLOT.top - 34}">${fret}</text>`);
    }

    const strings = data.strings.map((string, index) => {
      const y = yForString(index);
      const thickness = (1 + index * 0.25).toFixed(2);
      return `<line class="overview-string" style="stroke-width:${thickness}px" x1="${OVERVIEW_PLOT.left}" y1="${y}" x2="${OVERVIEW_PLOT.right}" y2="${y}"/>`
        + `<text class="overview-string-label" x="${OVERVIEW_PLOT.left - 22}" y="${y + 1}">${string.number} · ${esc(string.name)}</text>`;
    }).join("");

    const outlineFor = (mode) => pathForOutline(
      collectEntries(data, mode, "full"),
      xForFret,
      yForString,
      cellWidth
    );

    const familyContours = familyModes.map((mode) => {
      const role = focusMode ? "context" : "family";
      const stroke = focusMode ? "#9ca3af" : mode.accent;
      const family = positionFamilyFor(data, mode.position);
      const formName = family ? `${family.cagedForm}-form` : "CAGED-derived form";
      return `<g class="overview-contour ${role}" data-position-family="${mode.position}"${family ? ` data-caged-form="${family.cagedForm}"` : ""}>`
        + `<title>Position ${mode.position}, ${esc(formName)} of the parent-major chord, represented by the ${esc(mode.name)} contour</title>`
        + `<path class="overview-contour-path" style="stroke:${stroke}" d="${outlineFor(mode)}"/>`
        + "</g>";
    }).join("");

    const activeContour = focusMode
      ? `<g class="overview-contour active" data-active-contour="${focusMode.id}">`
        + `<title>Selected ${esc(focusMode.name)} contour</title>`
        + `<path class="overview-contour-path" style="fill:${focusMode.accent};stroke:${focusMode.accent}" d="${outlineFor(focusMode)}"/>`
        + "</g>"
      : "";

    const notes = data.strings.flatMap((string, stringIndex) => {
      const entries = [];
      for (let fret = minFret; fret <= maxFret; fret += 1) {
        const pc = pitchClass(string.openPitchClass, fret);
        if (!parentPitchClasses.has(pc)) continue;
        const tone = toneFor(labelMode, pc);
        if (!tone) throw new Error(`No ${labelMode.name} overview interval for string ${string.number}, fret ${fret}`);
        const insideFocus = Boolean(focusMode && focusMode.fretsByString[stringIndex].includes(fret));
        const isRoot = Boolean(focusMode && pc === focusMode.tonicPitchClass);
        const isCharacteristic = Boolean(focusMode && showCharacteristic && insideFocus
          && focusMode.characteristicDegrees.includes(tone.degree));
        const isModalTonicChord = Boolean(focusMode && modalTonicKind && insideFocus
          && modalTonicDegrees.has(tone.degree));
        const isAddedSeventh = Boolean(isModalTonicChord && modalTonicKind === "seventh"
          && tone.degree === focusMode.tones[6].degree);
        const isCagedChord = cagedChordFrets.has(`${stringIndex}:${fret}`);
        const isFullNeckPentatonicNote = Boolean(showFullNeckPentatonic && tone.core);
        const isFullNeckPentatonicHidden = Boolean(showFullNeckPentatonic && !tone.core);
        const visibleInsideFocus = Boolean(insideFocus
          && (view !== "pentatonic" || tone.core || isCharacteristic || isModalTonicChord || isCagedChord));
        const cagedDegree = isCagedChord ? parentChordDegreeByPitchClass.get(pc) : null;
        if (isCagedChord && !cagedDegree) {
          throw new Error(`CAGED reference note on string ${string.number}, fret ${fret} is not in the parent-major triad`);
        }
        entries.push({ string, stringIndex, fret, pc, tone, insideFocus, visibleInsideFocus, isRoot, isCharacteristic, isModalTonicChord, isAddedSeventh, isCagedChord, isFullNeckPentatonicNote, isFullNeckPentatonicHidden, cagedDegree });
      }
      return entries;
    }).map((entry) => {
      const x = xForFret(entry.fret);
      const y = yForString(entry.stringIndex);
      const classes = [
        "overview-note",
        entry.visibleInsideFocus ? "inside" : "",
        entry.insideFocus && !entry.visibleInsideFocus ? "omitted" : "",
        entry.insideFocus || entry.isFullNeckPentatonicNote ? (view === "full" ? "equal" : entry.tone.core ? "core" : "optional") : "",
        entry.isFullNeckPentatonicNote ? "pentatonic-across-neck" : "",
        entry.isFullNeckPentatonicHidden ? "pentatonic-hidden" : "",
        entry.isRoot ? "root" : "",
        entry.isCharacteristic ? "characteristic" : "",
        entry.isModalTonicChord ? "modal-tonic-chord" : "",
        entry.isAddedSeventh ? "added-seventh" : "",
        entry.isCagedChord ? "caged-chord" : ""
      ].filter(Boolean).join(" ");
      const degreeDescription = entry.isCagedChord
        ? `${data.parentScale.tonic} major chord degree ${entry.cagedDegree}, displayed; ${labelMode.tonic} ${labelMode.name} degree ${prettyDegree(entry.tone.degree)}`
        : `${labelMode.tonic} ${labelMode.name} degree ${prettyDegree(entry.tone.degree)}`;
      const modalChordDescription = focusMode && modalTonicKind
        ? modalTonicKind === "seventh"
          ? `${focusMode.tonic} ${focusMode.tonicChord.seventhQuality} modal tonic seventh chord`
          : `${focusMode.tonic} ${focusMode.tonicChord.triadQuality} modal tonic triad`
        : "";
      const accessible = `String ${entry.string.number}, fret ${entry.fret}, ${data.pitchClassNames[entry.pc]}, ${degreeDescription}${entry.insideFocus ? ", inside the selected contour" : ""}${entry.insideFocus && !entry.visibleInsideFocus ? ", omitted from the selected pentatonic-only view" : ""}${entry.isFullNeckPentatonicNote ? ", part of the selected mode's five-note core shown across the displayed fretboard" : ""}${entry.isFullNeckPentatonicHidden ? ", hidden by the across-neck pentatonic-only focus" : ""}${view === "pentatonic" && entry.visibleInsideFocus && !entry.tone.core ? ", outside the pentatonic core and retained as a learning-highlight reference" : ""}${entry.isRoot ? ", tonic" : ""}${entry.isCharacteristic ? ", characteristic tone" : ""}${entry.isModalTonicChord ? `, part of the ${modalChordDescription}` : ""}${entry.isAddedSeventh ? ", the added seventh above the tonic triad" : ""}${entry.isCagedChord ? `, part of the ${focusFamily.cagedForm}-form parent-major chord reference shape` : ""}`;
      return `<g class="${classes}" data-overview-note="true"${entry.insideFocus ? ' data-inside-focus="true"' : ""}${entry.visibleInsideFocus ? ' data-overview-visible-in-view="true"' : ""}${entry.isFullNeckPentatonicNote ? ' data-overview-pentatonic-note="true"' : ""}${entry.isRoot ? ' data-overview-root="true"' : ""}${entry.isCharacteristic ? ' data-overview-characteristic="true"' : ""}${entry.isModalTonicChord ? ` data-overview-modal-tonic-chord="true" data-overview-modal-tonic-kind="${modalTonicKind}"` : ""}${entry.isAddedSeventh ? ' data-overview-added-seventh="true"' : ""}${entry.isCagedChord ? ` data-overview-caged-chord="true" data-overview-caged-degree="${entry.cagedDegree}"` : ""} transform="translate(${x} ${y})">`
        + `<title>${esc(accessible)}</title>`
        + (entry.isRoot ? `<circle class="overview-root-ring" style="stroke:${focusMode.accent}" r="18"/>` : "")
        + `<circle class="overview-disc" r="12"/>`
        + `<text class="overview-degree" x="0" y="1">${esc(entry.cagedDegree || prettyDegree(entry.tone.degree))}</text>`
        + "</g>";
    }).join("");

    const anchorCallouts = [...data.modes]
      .sort((a, b) => a.anchor.fret - b.anchor.fret)
      .map((mode, index) => {
        const stringIndex = data.strings.findIndex((string) => string.number === mode.anchor.string);
        const x = xForFret(mode.anchor.fret);
        const y = yForString(stringIndex);
        const labelY = index % 2 === 0 ? 370 : 410;
        const state = !focusMode ? "all" : focusMode.id === mode.id ? "active" : "context";
        const anchorFamily = positionFamilyFor(data, mode.position);
        const cagedFormLabel = overviewOverlay === "caged" && anchorFamily
          ? ` · ${anchorFamily.cagedForm}-form`
          : "";
        return `<g class="overview-mode-anchor ${state}" data-mode-anchor="${mode.id}">`
          + `<title>${esc(mode.name)} begins on string ${mode.anchor.string}, fret ${mode.anchor.fret}</title>`
          + `<circle class="overview-anchor-ring" style="stroke:${mode.accent}" cx="${x}" cy="${y}" r="18"/>`
          + `<line class="overview-anchor-leader" style="stroke:${mode.accent}" x1="${x}" y1="${y + 20}" x2="${x}" y2="${labelY - 16}"/>`
          + `<text class="overview-anchor-label" style="fill:${mode.accent}" x="${x}" y="${labelY}">P${mode.position} · ${esc(mode.name)}${esc(cagedFormLabel)}</text>`
          + "</g>";
      }).join("");

    const characteristicDegrees = focusMode
      ? focusMode.characteristicDegrees.map(prettyDegree).join(" + ")
      : "";
    const visibleModeDegrees = new Set(view === "pentatonic"
      ? labelMode.tones.filter((tone) => tone.core).map((tone) => tone.degree)
      : labelMode.tones.map((tone) => tone.degree));
    const activeOverlayDegrees = overviewOverlay === "characteristic" && focusMode
      ? focusMode.characteristicDegrees
      : modalTonicChord.degrees;
    const outsideCoreOverlayDegrees = view === "pentatonic"
      ? activeOverlayDegrees.filter((degree) => !visibleModeDegrees.has(degree))
      : [];
    const outsideCoreOverlayFormula = outsideCoreOverlayDegrees.map(prettyDegree).join(" + ");
    const modalTonicFormula = modalTonicChord.degrees.map(prettyDegree).join(" + ");
    const pentatonicCoreFormula = labelMode.tones.filter((tone) => tone.core)
      .map((tone) => prettyDegree(tone.degree)).join(" + ");
    const modeFormula = (view === "pentatonic" ? labelMode.tones.filter((tone) => tone.core) : labelMode.tones)
      .map((tone) => prettyDegree(tone.degree)).join("  ");
    const familySummary = familyModes.map((mode) => {
      const family = positionFamilyFor(data, mode.position);
      return `P${mode.position}${family ? ` ${family.cagedForm}-form` : ""}`;
    }).join(" · ");
    const viewCaption = focusMode
      ? showFullNeckPentatonic
        ? `Mode ${focusMode.numeral} · ${pentatonicDisplayName(focusMode)} · ${focusMode.pentatonicNote ? "project-defined subset, not a standard named pentatonic" : "five-note core"} across the displayed fretboard (frets ${minFret}–${maxFret})`
        : `${modeViewSummary(focusMode, view)}${view === "pentatonic" && overviewOverlay !== "none" ? " · highlighted outside-core targets retained" : ""}`
      : `Parent major scale · ${familySummary} · seven modal roots`;
    let learningCaption = "Focus a mode to compare its learning highlights";
    let learningCaptionColor = "#4b5563";
    if (focusMode && showFullNeckPentatonic) {
      learningCaption = `Pentatonic only · ${pentatonicCoreFormula} · non-core mode tones hidden · ${focusMode.pentatonicNote ? "no single standard Locrian pentatonic" : `selected ${focusMode.name} position outlined`}`;
      learningCaptionColor = focusMode.accent;
    } else if (focusMode && overviewOverlay === "characteristic") {
      learningCaption = `${focusMode.characteristicDegrees.length === 1 ? "Characteristic tone" : "Characteristic tones"} · ${characteristicDegrees}${outsideCoreOverlayDegrees.length ? ` · ${outsideCoreOverlayFormula} shown as outside-core reference` : ""}`;
      learningCaptionColor = "#92400e";
    } else if (focusMode && modalTonicKind) {
      learningCaption = `${modalTonicChord.heading} · ${modalTonicFormula}${outsideCoreOverlayDegrees.length ? ` · ${outsideCoreOverlayFormula} shown as outside-core reference` : ""}${modalTonicKind === "seventh" ? ` · outlined ${prettyDegree(focusMode.tones[6].degree)} extends the triad` : ""}`;
      learningCaptionColor = "#5b21b6";
    } else if (focusMode && overviewOverlay === "caged") {
      learningCaption = `Parent-major CAGED chord · P${focusMode.position} ${focusFamily.cagedForm}-form ${data.parentScale.tonic} major · 1 + 3 + 5 · teal labels use parent-chord intervals${view === "pentatonic" ? " · outside-core chord tones retained" : ""}`;
      learningCaptionColor = "#0f766e";
    } else if (focusMode) {
      learningCaption = `Tonic roots ringed · no learning highlight selected`;
    }
    const overlayDescription = showFullNeckPentatonic
      ? ` The selected five-note core is shown across the displayed fretboard while non-core notes are hidden. The complete modal and CAGED contours remain as position guides, not pentatonic box boundaries.${focusMode.pentatonicNote ? " This Locrian-compatible subset is project-defined rather than a standard named pentatonic." : ""}`
      : overviewOverlay === "caged"
      ? ` The ${focusFamily.cagedForm}-form ${data.parentScale.tonic} major chord reference shape is highlighted. Its teal notes use parent-major chord degrees 1, 3, and 5; all other interval labels remain relative to ${focusMode.tonic}.`
      : modalTonicKind
        ? ` Every ${focusMode.tonic} ${modalTonicKind === "seventh" ? focusMode.tonicChord.seventhQuality : focusMode.tonicChord.triadQuality} modal tonic ${modalTonicKind === "seventh" ? "seventh-chord" : "triad"} target inside the selected contour is highlighted. This is a chord-tone map, not a single chord voicing.`
        : "";
    const viewDescription = focusMode
      ? showFullNeckPentatonic
        ? " Every occurrence of the selected mode's five-note core is emphasized from the lowest through highest displayed fret; notes outside the active contour are equally valid."
        : view === "full"
        ? " Every note inside the selected contour is displayed equally."
        : view === "pentatonic"
          ? ` Only notes in the five-note pentatonic core are emphasized inside the selected contour.${overviewOverlay !== "none" ? " Selected overlay targets outside that core remain visible for comparison." : ""}`
          : " Filled notes inside the selected contour form its pentatonic core; hollow notes are full-mode color tones outside that core."
      : "";
    const description = focusMode
      ? `A continuous fretboard from fret ${minFret} through ${maxFret}, relabeled for ${focusMode.tonic} ${focusMode.name}. Its exact contour is emphasized while the five position families remain as context.${viewDescription}${overlayDescription}`
      : `A continuous ${data.parentScale.tonic} major fretboard from fret ${minFret} through ${maxFret}. Five overlapping position contours contain seven relative modal roots.`;
    const anchorDescription = [...data.modes]
      .sort((a, b) => a.anchor.fret - b.anchor.fret)
      .map((mode) => `${mode.name}, position ${mode.position}, string ${mode.anchor.string} fret ${mode.anchor.fret}`)
      .join("; ");
    const titleId = `relative-mode-overview-${focusId}-title`;
    const descId = `relative-mode-overview-${focusId}-desc`;
    return `<svg xmlns="http://www.w3.org/2000/svg" class="overview-svg${focusMode ? " is-focused" : ""}" width="15in" height="4.79in" viewBox="0 0 ${OVERVIEW_WIDTH} ${OVERVIEW_HEIGHT}" role="img" aria-labelledby="${titleId} ${descId}" data-diagram="overview" data-focus="${focusId}" data-overlay="${overviewOverlay}" data-view="${view}"${showFullNeckPentatonic ? ' data-pentatonic-scope="full-neck"' : ""} data-fret-min="${minFret}" data-fret-max="${maxFret}">`
      + `<title id="${titleId}">Connected relative-mode positions${focusMode ? ` — ${esc(focusMode.name)} focus` : ""}</title>`
      + `<desc id="${descId}">${esc(`${description} ${anchorDescription}.`)}</desc>`
      + `<style>
        .overview-svg{background:#fff;color:#111827;font-family:Inter,Segoe UI,Arial,sans-serif;text-rendering:geometricPrecision}
        .overview-svg .overview-title{font-size:25px;font-weight:700;fill:#111827}.overview-svg .overview-formula{font-size:15px;font-weight:700;fill:#111827;text-anchor:end}.overview-svg .overview-view-caption{font-size:14px;fill:#4b5563}.overview-svg .overview-learning-caption{font-size:13px;font-weight:650}
        .overview-svg .overview-fret,.overview-svg .overview-string{stroke:#6b7280;vector-effect:non-scaling-stroke}.overview-svg .overview-fret{stroke-width:1}.overview-svg .overview-fret.landmark{stroke-width:2.5}.overview-svg .overview-string{stroke-linecap:round}
        .overview-svg .overview-fret-label,.overview-svg .overview-string-label{font-size:12px;fill:#4b5563;text-anchor:middle;dominant-baseline:middle}.overview-svg .overview-fret-label.landmark{font-weight:700;fill:#111827}.overview-svg .overview-string-label{text-anchor:end}
        .overview-svg .overview-contour-path{fill:none;stroke-linejoin:round;vector-effect:non-scaling-stroke}.overview-svg .overview-contour.family .overview-contour-path{stroke-width:4;opacity:.9}.overview-svg .overview-contour.context .overview-contour-path{stroke-width:1.5;opacity:.62}.overview-svg .overview-contour.active .overview-contour-path{fill-opacity:.035;stroke-width:5;opacity:1}.overview-svg[data-pentatonic-scope="full-neck"] .overview-contour.context .overview-contour-path{opacity:.18}
        .overview-svg .overview-disc{fill:#fff;stroke:#4b5563;stroke-width:1.6;vector-effect:non-scaling-stroke}.overview-svg .overview-degree{font-size:11px;font-weight:700;fill:#111827;text-anchor:middle;dominant-baseline:middle}.overview-svg.is-focused .overview-note{opacity:.32}.overview-svg.is-focused .overview-note.inside,.overview-svg.is-focused .overview-note.root,.overview-svg.is-focused .overview-note.caged-chord,.overview-svg.is-focused .overview-note.pentatonic-across-neck{opacity:1}.overview-svg.is-focused .overview-note.omitted,.overview-svg .overview-note.pentatonic-hidden{display:none}.overview-svg .overview-note.inside .overview-disc,.overview-svg .overview-note.pentatonic-across-neck .overview-disc{fill:#111827;stroke:#111827}.overview-svg .overview-note.inside .overview-degree,.overview-svg .overview-note.pentatonic-across-neck .overview-degree{fill:#fff}.overview-svg .overview-note.inside.optional .overview-disc{fill:#fff;stroke:#111827}.overview-svg .overview-note.inside.optional .overview-degree{fill:#111827}.overview-svg .overview-note.characteristic .overview-disc{fill:#fff;stroke:#b45309;stroke-width:4.5}.overview-svg .overview-note.characteristic .overview-degree{fill:#111827}.overview-svg .overview-note.modal-tonic-chord .overview-disc{fill:#6d28d9;stroke:#5b21b6;stroke-width:1.8}.overview-svg .overview-note.modal-tonic-chord .overview-degree{fill:#fff}.overview-svg .overview-note.modal-tonic-chord.added-seventh.core .overview-disc,.overview-svg .overview-note.modal-tonic-chord.added-seventh.equal .overview-disc{fill:#111827;stroke:#6d28d9;stroke-width:4}.overview-svg .overview-note.modal-tonic-chord.added-seventh.optional .overview-disc{fill:#fff;stroke:#6d28d9;stroke-width:4}.overview-svg .overview-note.modal-tonic-chord.added-seventh.optional .overview-degree{fill:#5b21b6}.overview-svg .overview-note.caged-chord .overview-disc{fill:#0f766e;stroke:#0f766e}.overview-svg .overview-note.caged-chord .overview-degree{fill:#fff}.overview-svg .overview-root-ring{fill:none;stroke-width:3;vector-effect:non-scaling-stroke}
        .overview-svg .overview-anchor-ring{fill:none;stroke-width:3;vector-effect:non-scaling-stroke}.overview-svg .overview-anchor-leader{stroke-width:1.5;vector-effect:non-scaling-stroke}.overview-svg .overview-anchor-label{font-size:13px;font-weight:700;text-anchor:middle}.overview-svg .overview-mode-anchor.context{opacity:.27}.overview-svg .overview-mode-anchor.active{opacity:1}.overview-svg[data-pentatonic-scope="full-neck"] .overview-mode-anchor.context{opacity:.15}
      </style>`
      + `<rect width="${OVERVIEW_WIDTH}" height="${OVERVIEW_HEIGHT}" fill="#fff"/>`
      + `<text class="overview-title" x="${OVERVIEW_PLOT.left}" y="34">How the boxes connect</text>`
      + `<text class="overview-formula" x="${OVERVIEW_PLOT.right}" y="39">${esc(modeFormula)}</text>`
      + `<text class="overview-view-caption" x="${OVERVIEW_PLOT.left}" y="61">${esc(viewCaption)}</text>`
      + `<text class="overview-learning-caption" style="fill:${learningCaptionColor}" x="${OVERVIEW_PLOT.left}" y="85">${esc(learningCaption)}</text>`
      + familyContours + activeContour + fretLines.join("") + strings + fretLabels.join("") + notes + anchorCallouts
      + "</svg>";
  }

  function renderModeSvg(data, mode, options = {}) {
    const view = normalizeView(options.view);
    const overlay = normalizeOverlay(options.overlay);
    const fretSpacing = normalizeFretSpacing(options.fretSpacing);
    const overlayInfo = overlayFor(mode, overlay);
    const overlayDegrees = new Set(overlayInfo.degrees);
    const entriesByString = collectEntries(data, mode, view);
    if (entriesByString.some((entries) => entries.length === 0)) {
      throw new Error(`${mode.name} has a string with no visible notes in ${view} view`);
    }

    const originalFrets = mode.fretsByString.flat();
    const minFret = Math.min(...originalFrets);
    const maxFret = Math.max(...originalFrets);
    const fretCount = maxFret - minFret + 1;
    const fretGeometry = modeFretGeometry(minFret, maxFret, fretSpacing);
    const stringSpacing = (PLOT.bottom - PLOT.top) / (data.strings.length - 1);
    const xForFret = fretGeometry.xForFret;
    const yForString = (index) => PLOT.top + index * stringSpacing;
    const titleId = `${mode.id}-${view}-title`;
    const descId = `${mode.id}-${view}-desc`;
    const formulaTones = view === "pentatonic" ? mode.tones.filter((item) => item.core) : mode.tones;
    const formula = formulaTones.map((item) => prettyDegree(item.degree)).join("  ");
    const subtitle = modeViewSummary(mode, view);
    const description = view === "pentatonic"
      ? `${mode.tonic} ${mode.name} position showing only its five-note ${mode.pentatonicName} core.${mode.pentatonicNote ? ` ${mode.pentatonicNote}.` : ""}`
      : view === "full"
        ? `${mode.tonic} ${mode.name} seven-note position with every mode tone shown equally.`
        : `${mode.tonic} ${mode.name} seven-note position. Filled markers belong to ${mode.pentatonicName}; hollow markers are modal color tones outside that core.${mode.pentatonicNote ? ` ${mode.pentatonicNote}.` : ""}`;
    const inventory = entriesByString.map((entries, index) => `String ${data.strings[index].number}: ${entries
      .map((entry) => `fret ${entry.fret} ${entry.note}, degree ${prettyDegree(entry.tone.degree)}${entry.root ? " tonic" : ""}`)
      .join("; ")}`).join(". ");
    const visibleDegrees = new Set(entriesByString.flat().map((entry) => entry.tone.degree));
    const hiddenOverlayDegrees = overlayInfo.degrees.filter((degree) => !visibleDegrees.has(degree));
    const overlayFormula = overlayInfo.degrees.map(prettyDegree).join(" + ");
    const hiddenOverlayFormula = hiddenOverlayDegrees.map(prettyDegree).join(" + ");
    const overlayCaption = overlay === "none"
      ? ""
      : `${overlayInfo.heading} · ${overlayFormula}${hiddenOverlayDegrees.length ? ` · ${hiddenOverlayFormula} hidden in this view` : ""}`;
    const overlayDescription = overlay === "none"
      ? ""
      : ` ${overlayInfo.heading} highlights degrees ${overlayInfo.degrees.map(prettyDegree).join(", ")}.${hiddenOverlayDegrees.length ? ` Degrees ${hiddenOverlayDegrees.map(prettyDegree).join(", ")} are not displayed in this view.` : ""}`;
    const fretSpacingDescription = fretSpacing === "wide"
      ? " Frets use the full-width equal-spacing layout."
      : fretSpacing === "guitar"
        ? " Fret widths taper by the guitar's twelve-tone equal-temperament ratio within this position."
        : " Frets use the centered compact equal-spacing layout.";

    const fretLines = [];
    for (let boundaryIndex = 0; boundaryIndex <= fretCount; boundaryIndex += 1) {
      const x = fretGeometry.boundaries[boundaryIndex];
      fretLines.push(`<line class="fret" x1="${x}" y1="${PLOT.top - 21}" x2="${x}" y2="${PLOT.bottom + 21}"/>`);
    }

    const fretLabels = [];
    for (let fret = minFret; fret <= maxFret; fret += 1) {
      fretLabels.push(`<text class="fret-label" x="${xForFret(fret)}" y="${PLOT.top - 33}">${fret}</text>`);
    }

    const strings = data.strings.map((string, index) => {
      const y = yForString(index);
      const thickness = (1 + index * 0.28).toFixed(2);
      return [
        `<line class="string" style="stroke-width:${thickness}px" x1="${fretGeometry.left}" y1="${y}" x2="${fretGeometry.right}" y2="${y}"/>`,
        `<text class="string-label" x="${fretGeometry.left - 28}" y="${y + 1}">${string.number} · ${esc(string.name)}</text>`
      ].join("");
    }).join("");

    const markers = entriesByString.flat().map((entry) => {
      const x = xForFret(entry.fret);
      const y = yForString(entry.stringIndex);
      const kind = view === "full" ? "equal" : entry.tone.core ? "core" : "optional";
      const highlighted = overlayDegrees.has(entry.tone.degree);
      const accessible = `String ${entry.string.number}, fret ${entry.fret}, ${entry.note}, degree ${prettyDegree(entry.tone.degree)}, ${entry.tone.core ? "part of the pentatonic core" : "outside the pentatonic core"}${entry.root ? ", tonic" : ""}${highlighted ? `, selected by the ${overlayInfo.accessible}` : ""}`;
      return `<g class="marker ${kind}${highlighted ? " overlay-highlight" : ""}${entry.root ? " tonic" : ""}"${highlighted ? ' data-highlighted="true"' : ""} transform="translate(${x} ${y})">`
        + `<title>${esc(accessible)}</title>`
        + (entry.root ? `<circle class="tonic-ring" style="stroke:${mode.accent}" r="${MODE_MARKER_GEOMETRY.tonicRadius}"/>` : "")
        + `<circle class="marker-disc" r="${MODE_MARKER_GEOMETRY.radius}"/>`
        + markerLabel(entry)
        + "</g>";
    }).join("");

    const outline = pathForOutline(entriesByString, xForFret, yForString, fretGeometry.minCellWidth);
    const legendItems = view === "full"
      ? [{ kind: "equal", label: "mode note" }]
      : view === "pentatonic"
        ? [{ kind: "core", label: "pentatonic note" }]
        : [{ kind: "core", label: "pentatonic core" }, { kind: "optional", label: "modal color tone" }];
    legendItems.push({ kind: "tonic", label: "tonic" });
    if (overlay !== "none") legendItems.push({ kind: "overlay", label: overlayInfo.legend });
    const legend = `<g transform="translate(${PLOT.left} 340)">${legendItems.map((item, index) => {
      const x = index * 210;
      if (item.kind === "tonic") {
        return `<g transform="translate(${x} 0)"><circle class="legend-tonic" style="stroke:${mode.accent}" cx="0" cy="0" r="11"/><circle class="legend-core" cx="0" cy="0" r="8"/><text class="legend-text" x="15" y="1">${item.label}</text></g>`;
      }
      if (item.kind === "overlay") {
        return `<g transform="translate(${x} 0)"><circle class="legend-overlay" cx="0" cy="0" r="8"/><text class="legend-text" x="17" y="1">${item.label}</text></g>`;
      }
      return `<g transform="translate(${x} 0)"><circle class="legend-${item.kind}" cx="0" cy="0" r="8"/><text class="legend-text" x="15" y="1">${item.label}</text></g>`;
    }).join("")}</g>`;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="10in" height="4.0625in" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="${titleId} ${descId}" data-mode-id="${mode.id}" data-view="${view}" data-overlay="${overlay}" data-fret-spacing="${fretSpacing}">`
      + `<title id="${titleId}">${esc(mode.tonic)} ${esc(mode.name)} — ${viewDisplayName(view)}${overlay === "none" ? "" : ` — ${overlayInfo.accessible}`}</title>`
      + `<desc id="${descId}">${esc(`${description}${overlayDescription}${fretSpacingDescription} ${inventory}`)}</desc>`
      + `<style>
        svg{background:#fff;color:#111827;font-family:Inter,Segoe UI,Arial,sans-serif;text-rendering:geometricPrecision}
        text{fill:#111827}
        .diagram-title{font-size:25px;font-weight:700}.subtitle{font-size:14px;fill:#4b5563}.formula{font-size:15px;font-weight:650;text-anchor:end}
        .fret,.string{stroke:#6b7280;vector-effect:non-scaling-stroke}.fret{stroke-width:1px}.string{stroke-linecap:round}
        .fret-label,.string-label{font-size:13px;fill:#4b5563;text-anchor:middle;dominant-baseline:middle}
        .string-label{text-anchor:end}.position-outline{fill-opacity:.055;stroke-width:4;stroke-linejoin:round;vector-effect:non-scaling-stroke}
        .marker-disc{stroke:#111827;stroke-width:${MODE_MARKER_GEOMETRY.discStrokeWidth};vector-effect:non-scaling-stroke}.core .marker-disc,.equal .marker-disc{fill:#111827}.optional .marker-disc{fill:#fff}
        .marker-label{font-size:${MODE_MARKER_GEOMETRY.labelSize}px;font-weight:700;text-anchor:middle;dominant-baseline:middle;pointer-events:none}.core .marker-label,.equal .marker-label{fill:#fff}.optional .marker-label{fill:#111827}
        .overlay-highlight .marker-disc{stroke:#b45309;stroke-width:${MODE_MARKER_GEOMETRY.overlayStrokeWidth}}
        .tonic-ring{fill:none;stroke-width:${MODE_MARKER_GEOMETRY.tonicStrokeWidth};vector-effect:non-scaling-stroke}
        .legend-core,.legend-equal{fill:#111827;stroke:#111827;stroke-width:1.5}.legend-optional{fill:#fff;stroke:#111827;stroke-width:1.8}.legend-tonic{fill:none;stroke-width:2.5}.legend-overlay{fill:#111827;stroke:#b45309;stroke-width:4}
        .legend-text{font-size:13px;fill:#374151;dominant-baseline:middle}.overlay-caption{font-size:13px;font-weight:650;fill:#92400e}
      </style>`
      + `<rect width="${WIDTH}" height="${HEIGHT}" fill="#fff"/>`
      + `<text class="diagram-title" x="${PLOT.left}" y="39">${esc(mode.name)}</text>`
      + `<text class="subtitle" x="${PLOT.left}" y="63">${esc(subtitle)}</text>`
      + (overlayCaption ? `<text class="overlay-caption" x="${PLOT.left}" y="86">${esc(overlayCaption)}</text>` : "")
      + `<text class="formula" x="${PLOT.right}" y="45">${esc(formula)}</text>`
      + `<path class="position-outline" style="fill:${mode.accent};stroke:${mode.accent}" d="${outline}"/>`
      + fretLines.join("") + strings + fretLabels.join("") + markers + legend
      + "</svg>";
  }

  function exportFileStem(mode, requestedView, requestedOverlay = "none", requestedFretSpacing = "compact") {
    const tonic = mode.tonic.toLowerCase().replace("♯", "s").replace("♭", "b");
    const view = normalizeView(requestedView);
    const overlay = normalizeOverlay(requestedOverlay);
    const fretSpacing = normalizeFretSpacing(requestedFretSpacing);
    const viewSuffix = view === "full" ? "scale" : view === "pentatonic" ? "pentatonic" : "scale-pentatonic-emphasis";
    const spacingSuffix = fretSpacing === "compact" ? "" : `-${fretSpacing}-spacing`;
    return `${tonic}-${mode.name.toLowerCase()}-${viewSuffix}${overlay === "none" ? "" : `-${overlay}`}${spacingSuffix}`;
  }

  function overviewFileStem(data, requestedFocus) {
    const mode = overviewFocusMode(data, requestedFocus);
    return mode ? `${mode.id}-connected-box-overview` : "relative-mode-box-overview";
  }

  return {
    renderModeSvg,
    renderOverviewSvg,
    collectEntries,
    toneFor,
    exportFileStem,
    prettyDegree,
    pentatonicDisplayName,
    modeViewSummary,
    overlayFor,
    overviewFocusMode,
    overviewFileStem,
    normalizeView,
    normalizeOverlay,
    normalizeFretSpacing,
    normalizeOverviewOverlay,
    modeFretGeometry,
    modeMarkerGeometry: MODE_MARKER_GEOMETRY
  };
}));
