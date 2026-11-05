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
  const OVERVIEW_HEIGHT = 500;
  const OVERVIEW_PLOT = { left: 80, right: 1400, top: 145, bottom: 295 };
  const MAJOR_SCALE_OFFSETS = Object.freeze([0, 2, 4, 5, 7, 9, 11]);
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
  const normalizePentatonicRoots = (roots) => ["major", "minor", "both"].includes(roots) ? roots : "both";

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

  function pentatonicRootsFor(data, mode) {
    const core = new Set(mode.tones.filter((tone) => tone.core)
      .map((tone) => (mode.tonicPitchClass + tone.semitones) % 12));
    if (core.size !== 5) return null;
    const majorPitchClass = [...core].find((root) => [0, 2, 4, 7, 9]
      .every((interval) => core.has((root + interval) % 12)));
    if (majorPitchClass === undefined) return null;
    const minorPitchClass = (majorPitchClass + 9) % 12;
    return {
      major: { tonicPitchClass: majorPitchClass, tonic: data.pitchClassNames[majorPitchClass] },
      minor: { tonicPitchClass: minorPitchClass, tonic: data.pitchClassNames[minorPitchClass] }
    };
  }

  function pentatonicRootMarker(kind, size = 17) {
    return kind === "major"
      ? `<circle class="overview-pentatonic-root major" r="${size}"/>`
      : `<rect class="overview-pentatonic-root minor" x="${-size}" y="${-size}" width="${size * 2}" height="${size * 2}" rx="3"/>`;
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

  function modeKeyFor(mode) {
    return mode.key || mode.name.toLowerCase();
  }

  function overviewModeTemplate(data, requestedMode) {
    if (!Array.isArray(data.modes) || data.modes.length === 0) return null;
    if (!requestedMode || requestedMode === "all") {
      return data.modes.find((mode) => modeKeyFor(mode) === "ionian") || data.modes[0];
    }
    const normalized = String(requestedMode).toLowerCase();
    return data.modes.find((mode) => mode.id === requestedMode
      || modeKeyFor(mode) === normalized
      || mode.name.toLowerCase() === normalized) || null;
  }

  function majorKeyFor(data, requestedPitchClass) {
    const fallbackPitchClass = data.parentScale.pitchClasses[0];
    const numeric = Number(requestedPitchClass);
    const pitchClass = Number.isInteger(numeric) && numeric >= 0 && numeric <= 11
      ? numeric
      : fallbackPitchClass;
    if (Array.isArray(data.majorKeys)) {
      const match = data.majorKeys.find((key) => key.pitchClass === pitchClass);
      if (match) return match;
    }
    const tonic = data.pitchClassNames[pitchClass];
    return {
      pitchClass,
      tonic,
      notes: MAJOR_SCALE_OFFSETS.map((offset) => data.pitchClassNames[(pitchClass + offset) % 12])
    };
  }

  function lowERootFret(data, pitchClassValue) {
    const lowE = data.strings.find((string) => string.number === 6) || data.strings.at(-1);
    const fretWithinOctave = (pitchClassValue - lowE.openPitchClass + 12) % 12;
    return fretWithinOctave === 0 ? 12 : fretWithinOctave;
  }

  function pentatonicNameFor(mode, tonic) {
    if (mode.name === "Locrian") return `${tonic} Locrian-compatible pentatonic`;
    return `${tonic} ${mode.tones.some((tone) => tone.degree === "3") ? "major" : "minor"} pentatonic`;
  }

  function slug(value) {
    return String(value).toLowerCase()
      .replaceAll("♯", "s")
      .replaceAll("♭", "b")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function modulo(value, divisor) {
    return ((value % divisor) + divisor) % divisor;
  }

  function deriveOverviewContext(data, options = {}) {
    const requestedMode = options.mode === undefined ? options.focusMode : options.mode;
    const selectedTemplate = overviewModeTemplate(data, requestedMode)
      || overviewModeTemplate(data, "ionian");
    if (!selectedTemplate) throw new Error("The overview requires at least one mode definition");

    const selectedDegreeIndex = Number.isInteger(selectedTemplate.degreeIndex)
      ? selectedTemplate.degreeIndex
      : Math.max(0, data.modes.indexOf(selectedTemplate));
    const requestedTonic = Number(options.tonicPitchClass);
    const hasRequestedTonic = Number.isInteger(requestedTonic)
      && requestedTonic >= 0 && requestedTonic <= 11;
    const legacyParent = majorKeyFor(data, options.parentPitchClass);
    const parentPitchClass = hasRequestedTonic
      ? modulo(requestedTonic - MAJOR_SCALE_OFFSETS[selectedDegreeIndex], 12)
      : legacyParent.pitchClass;
    const parentKey = majorKeyFor(data, parentPitchClass);
    const referenceIonian = overviewModeTemplate(data, "ionian");
    const referenceRootFret = referenceIonian && referenceIonian.anchor
      ? referenceIonian.anchor.fret
      : lowERootFret(data, data.parentScale.pitchClasses[0]);
    const parentRootFret = lowERootFret(data, parentKey.pitchClass);
    const fretShift = parentRootFret - referenceRootFret;
    const parentPitchClasses = MAJOR_SCALE_OFFSETS.map((offset) => (parentKey.pitchClass + offset) % 12);
    const parentNotes = Array.isArray(parentKey.notes) && parentKey.notes.length === 7
      ? [...parentKey.notes]
      : parentPitchClasses.map((pc) => data.pitchClassNames[pc]);
    const pitchClassNames = { ...data.pitchClassNames };
    parentPitchClasses.forEach((pc, index) => { pitchClassNames[pc] = parentNotes[index]; });

    const positionFamilies = data.positionFamilies.map((family) => ({
      ...family,
      scaleFretsByString: family.scaleFretsByString.map((frets) => frets.map((fret) => fret + fretShift)),
      chordFretsByString: family.chordFretsByString.map((frets) => frets.map((fret) => fret + fretShift))
    }));

    const modes = data.modes.map((mode, index) => {
      const degreeIndex = Number.isInteger(mode.degreeIndex) ? mode.degreeIndex : index;
      const tonicPitchClass = parentPitchClasses[degreeIndex];
      const tonic = parentNotes[degreeIndex];
      return {
        ...mode,
        id: modeKeyFor(mode),
        sourceId: mode.id,
        key: modeKeyFor(mode),
        degreeIndex,
        tonic,
        tonicPitchClass,
        pentatonicName: pentatonicNameFor(mode, tonic),
        anchor: {
          string: 6,
          fret: parentRootFret + MAJOR_SCALE_OFFSETS[degreeIndex]
        },
        fretsByString: mode.fretsByString.map((frets) => frets.map((fret) => fret + fretShift))
      };
    });
    const selectedMode = modes.find((mode) => mode.key === modeKeyFor(selectedTemplate)) || modes[0];
    const overviewData = {
      ...data,
      pitchClassNames,
      parentScale: {
        ...data.parentScale,
        tonic: parentKey.tonic,
        tonicPitchClass: parentKey.pitchClass,
        pitchClasses: parentPitchClasses,
        notes: parentNotes
      },
      positionFamilies,
      modes
    };

    return {
      data: overviewData,
      parentKey: { ...parentKey, notes: parentNotes },
      parentRootFret,
      fretShift,
      selectedTemplate,
      selectedMode,
      tonicPitchClass: selectedMode.tonicPitchClass,
      selectedAnchorFret: selectedMode.anchor.fret,
      modes
    };
  }

  function overviewFocusMode(data, requestedFocus) {
    return overviewModeTemplate(data, requestedFocus);
  }

  function positionFamilyFor(data, position) {
    return Array.isArray(data.positionFamilies)
      ? data.positionFamilies.find((family) => family.position === position) || null
      : null;
  }

  function overviewPositionFamily(data, requestedPosition) {
    if (requestedPosition === undefined || requestedPosition === null || requestedPosition === "all") return null;
    const numericPosition = typeof requestedPosition === "number" ? requestedPosition : Number(requestedPosition);
    return Number.isInteger(numericPosition) ? positionFamilyFor(data, numericPosition) : null;
  }

  function normalizeOverviewOverlay(requestedOverlay, legacyShowCharacteristic) {
    if (VALID_OVERVIEW_OVERLAYS.has(requestedOverlay)) return requestedOverlay;
    return legacyShowCharacteristic === false ? "none" : "characteristic";
  }

  function renderOverviewSvg(data, options = {}) {
    const context = deriveOverviewContext(data, options);
    const overviewData = context.data;
    const focusMode = context.selectedMode;
    const legacyPosition = options.position === undefined && options.mode === undefined
      && options.focusMode && options.focusMode !== "all"
      ? context.selectedTemplate.position
      : "all";
    const focusFamily = overviewPositionFamily(overviewData, options.position === undefined ? legacyPosition : options.position);
    const positionId = focusFamily ? String(focusFamily.position) : "all";
    const requestedOverlay = normalizeOverviewOverlay(options.overlay, options.showCharacteristic);
    const overviewOverlay = requestedOverlay;
    const showFullNeckPentatonic = overviewOverlay === "pentatonic";
    const pentatonicRoots = showFullNeckPentatonic ? pentatonicRootsFor(overviewData, focusMode) : null;
    const rootSelection = normalizePentatonicRoots(options.pentatonicRoots);
    const rootKinds = pentatonicRoots ? (rootSelection === "both" ? ["major", "minor"] : [rootSelection]) : [];
    const view = showFullNeckPentatonic ? "pentatonic" : "combined";
    const showCharacteristic = overviewOverlay === "characteristic";
    const modalTonicKind = overviewOverlay === "triad" || overviewOverlay === "seventh"
      ? overviewOverlay
      : null;
    const modalTonicChord = modalTonicKind
      ? overlayFor(focusMode, modalTonicKind)
      : { degrees: [] };
    const modalTonicDegrees = new Set(modalTonicChord.degrees);
    const cagedFormsByFret = new Map();
    if (overviewOverlay === "caged") {
      const cagedFamilies = focusFamily ? [focusFamily] : overviewData.positionFamilies;
      cagedFamilies.forEach((family) => {
        family.chordFretsByString.forEach((frets, stringIndex) => {
          frets.forEach((fret) => {
            const key = `${stringIndex}:${fret}`;
            if (!cagedFormsByFret.has(key)) cagedFormsByFret.set(key, new Set());
            cagedFormsByFret.get(key).add(family.cagedForm);
          });
        });
      });
    }
    const labelMode = focusMode;
    const families = [...overviewData.positionFamilies].sort((a, b) => a.position - b.position);
    const allFrets = families.flatMap((family) => family.scaleFretsByString.flat());
    const minFret = Math.min(...allFrets);
    const maxFret = Math.max(...allFrets);
    const fretCount = maxFret - minFret + 1;
    const cellWidth = (OVERVIEW_PLOT.right - OVERVIEW_PLOT.left) / fretCount;
    const stringSpacing = (OVERVIEW_PLOT.bottom - OVERVIEW_PLOT.top) / (overviewData.strings.length - 1);
    const xForFret = (fret) => OVERVIEW_PLOT.left + ((fret - minFret) + 0.5) * cellWidth;
    const yForString = (index) => OVERVIEW_PLOT.top + index * stringSpacing;
    const parentPitchClasses = new Set(overviewData.parentScale.pitchClasses);
    const parentChordDegreeByPitchClass = new Map([
      [overviewData.parentScale.pitchClasses[0], "1"],
      [overviewData.parentScale.pitchClasses[2], "3"],
      [overviewData.parentScale.pitchClasses[4], "5"]
    ]);

    const fretLines = [];
    for (let fret = minFret; fret <= maxFret + 1; fret += 1) {
      const x = OVERVIEW_PLOT.left + (fret - minFret) * cellWidth;
      const landmark = fret > 0 && fret % 12 === 0;
      fretLines.push(`<line class="overview-fret${landmark ? " landmark" : ""}" x1="${x}" y1="${OVERVIEW_PLOT.top - 20}" x2="${x}" y2="${OVERVIEW_PLOT.bottom + 20}"/>`);
    }

    const fretLabels = [];
    for (let fret = minFret; fret <= maxFret; fret += 1) {
      const landmark = fret > 0 && fret % 12 === 0;
      fretLabels.push(`<text class="overview-fret-label${landmark ? " landmark" : ""}" x="${xForFret(fret)}" y="${OVERVIEW_PLOT.top - 34}">${fret}</text>`);
    }

    const strings = overviewData.strings.map((string, index) => {
      const y = yForString(index);
      const thickness = (1 + index * 0.25).toFixed(2);
      return `<line class="overview-string" style="stroke-width:${thickness}px" x1="${OVERVIEW_PLOT.left}" y1="${y}" x2="${OVERVIEW_PLOT.right}" y2="${y}"/>`
        + `<text class="overview-string-label" x="${OVERVIEW_PLOT.left - 22}" y="${y + 1}">${string.number} · ${esc(string.name)}</text>`;
    }).join("");

    const outlineFor = (family) => pathForOutline(
      family.scaleFretsByString.map((frets, stringIndex) => frets.map((fret) => ({ fret, stringIndex }))),
      xForFret,
      yForString,
      cellWidth
    );

    const familyContours = families.map((family) => {
      const role = focusFamily ? "context" : "family";
      const stroke = focusFamily ? "#9ca3af" : family.accent || "#64748b";
      return `<g class="overview-contour ${role}" data-position-family="${family.position}" data-caged-form="${family.cagedForm}">`
        + `<title>Position ${family.position}, ${esc(family.cagedForm)}-form region of the parent-major scale</title>`
        + `<path class="overview-contour-path" style="stroke:${stroke}" d="${outlineFor(family)}"/>`
        + "</g>";
    }).join("");

    const activeContour = focusFamily
      ? `<g class="overview-contour active" data-active-position="${focusFamily.position}" data-caged-form="${focusFamily.cagedForm}">`
        + `<title>Selected P${focusFamily.position} ${esc(focusFamily.cagedForm)}-form position; intervals remain relative to ${esc(focusMode.tonic)}</title>`
        + `<path class="overview-contour-path" style="fill:#334155;stroke:#334155" d="${outlineFor(focusFamily)}"/>`
        + "</g>"
      : "";

    const notes = overviewData.strings.flatMap((string, stringIndex) => {
      const entries = [];
      for (let fret = minFret; fret <= maxFret; fret += 1) {
        const pc = pitchClass(string.openPitchClass, fret);
        if (!parentPitchClasses.has(pc)) continue;
        const tone = toneFor(labelMode, pc);
        if (!tone) throw new Error(`No ${labelMode.name} overview interval for string ${string.number}, fret ${fret}`);
        const insidePosition = Boolean(!focusFamily || focusFamily.scaleFretsByString[stringIndex].includes(fret));
        const isRoot = pc === focusMode.tonicPitchClass;
        const pentatonicRoot = rootKinds.find((kind) => pc === pentatonicRoots[kind].tonicPitchClass);
        const isCharacteristic = Boolean(showCharacteristic && insidePosition
          && focusMode.characteristicDegrees.includes(tone.degree));
        const isModalTonicChord = Boolean(modalTonicKind && insidePosition
          && modalTonicDegrees.has(tone.degree));
        const isAddedSeventh = Boolean(isModalTonicChord && modalTonicKind === "seventh"
          && tone.degree === focusMode.tones[6].degree);
        const cagedForms = cagedFormsByFret.has(`${stringIndex}:${fret}`)
          ? [...cagedFormsByFret.get(`${stringIndex}:${fret}`)]
          : [];
        const isCagedChord = cagedForms.length > 0;
        const isFullNeckPentatonicNote = Boolean(showFullNeckPentatonic && tone.core);
        const isFullNeckPentatonicHidden = Boolean(showFullNeckPentatonic && !tone.core);
        const visibleInsidePosition = Boolean(insidePosition
          && (view !== "pentatonic" || tone.core || isCharacteristic || isModalTonicChord || isCagedChord));
        const cagedDegree = isCagedChord ? parentChordDegreeByPitchClass.get(pc) : null;
        if (isCagedChord && !cagedDegree) {
          throw new Error(`CAGED reference note on string ${string.number}, fret ${fret} is not in the parent-major triad`);
        }
        entries.push({ string, stringIndex, fret, pc, tone, insidePosition, visibleInsidePosition, isRoot, pentatonicRoot, isCharacteristic, isModalTonicChord, isAddedSeventh, isCagedChord, isFullNeckPentatonicNote, isFullNeckPentatonicHidden, cagedDegree, cagedForms });
      }
      return entries;
    }).map((entry) => {
      const x = xForFret(entry.fret);
      const y = yForString(entry.stringIndex);
      const classes = [
        "overview-note",
        entry.visibleInsidePosition ? "inside" : "",
        entry.insidePosition && !entry.visibleInsidePosition ? "omitted" : "",
        entry.insidePosition || entry.isFullNeckPentatonicNote ? (view === "full" ? "equal" : entry.tone.core ? "core" : "optional") : "",
        entry.isFullNeckPentatonicNote ? "pentatonic-across-neck" : "",
        entry.isFullNeckPentatonicHidden ? "pentatonic-hidden" : "",
        entry.isRoot ? "root" : "",
        entry.pentatonicRoot ? `pentatonic-${entry.pentatonicRoot}-root` : "",
        entry.isCharacteristic ? "characteristic" : "",
        entry.isModalTonicChord ? "modal-tonic-chord" : "",
        entry.isAddedSeventh ? "added-seventh" : "",
        entry.isCagedChord ? "caged-chord" : ""
      ].filter(Boolean).join(" ");
      const degreeDescription = entry.isCagedChord
        ? `${overviewData.parentScale.tonic} major chord degree ${entry.cagedDegree}, displayed; ${labelMode.tonic} ${labelMode.name} degree ${prettyDegree(entry.tone.degree)}`
        : `${labelMode.tonic} ${labelMode.name} degree ${prettyDegree(entry.tone.degree)}`;
      const modalChordDescription = modalTonicKind
        ? modalTonicKind === "seventh"
          ? `${focusMode.tonic} ${focusMode.tonicChord.seventhQuality} modal tonic seventh chord`
          : `${focusMode.tonic} ${focusMode.tonicChord.triadQuality} modal tonic triad`
        : "";
      const accessible = `String ${entry.string.number}, fret ${entry.fret}, ${overviewData.pitchClassNames[entry.pc]}, ${degreeDescription}${entry.insidePosition ? focusFamily ? ", inside the selected position" : ", inside the displayed all-position scope" : ", outside the selected position"}${entry.insidePosition && !entry.visibleInsidePosition ? ", omitted from the selected pentatonic-only view" : ""}${entry.isFullNeckPentatonicNote ? ", part of the selected mode's five-note core shown across the displayed fretboard" : ""}${entry.isFullNeckPentatonicHidden ? ", hidden by the across-neck pentatonic-only focus" : ""}${entry.isRoot ? ", tonic" : ""}${entry.isCharacteristic ? ", characteristic tone" : ""}${entry.isModalTonicChord ? `, part of the ${modalChordDescription}` : ""}${entry.isAddedSeventh ? ", the added seventh above the tonic triad" : ""}${entry.isCagedChord ? `, part of the parent-major ${entry.cagedForms.map((form) => `${form}-form`).join(" and ")} reference shape` : ""}`;
      return `<g class="${classes}" data-overview-note="true"${entry.pentatonicRoot ? ` data-pentatonic-root="${entry.pentatonicRoot}"` : ""}${entry.insidePosition ? ' data-inside-position="true"' : ""}${entry.visibleInsidePosition ? ' data-overview-visible-in-view="true"' : ""}${entry.isFullNeckPentatonicNote ? ' data-overview-pentatonic-note="true"' : ""}${entry.isRoot ? ' data-overview-root="true"' : ""}${entry.isCharacteristic ? ' data-overview-characteristic="true"' : ""}${entry.isModalTonicChord ? ` data-overview-modal-tonic-chord="true" data-overview-modal-tonic-kind="${modalTonicKind}"` : ""}${entry.isAddedSeventh ? ' data-overview-added-seventh="true"' : ""}${entry.isCagedChord ? ` data-overview-caged-chord="true" data-overview-caged-degree="${entry.cagedDegree}" data-overview-caged-forms="${entry.cagedForms.join(",")}"` : ""} transform="translate(${x} ${y})">`
        + `<title>${esc(accessible)}${entry.pentatonicRoot ? esc(`, ${pentatonicRoots[entry.pentatonicRoot].tonic} ${entry.pentatonicRoot} pentatonic root`) : ""}</title>`
        + (entry.pentatonicRoot ? pentatonicRootMarker(entry.pentatonicRoot) : "")
        + (entry.isRoot && !pentatonicRoots ? `<circle class="overview-root-ring" style="stroke:${focusMode.accent}" r="18"/>` : "")
        + `<circle class="overview-disc" r="12"/>`
        + `<text class="overview-degree" x="0" y="1">${esc(entry.cagedDegree || prettyDegree(entry.tone.degree))}</text>`
        + "</g>";
    }).join("");

    const positionCallouts = families.map((family) => {
        const familyFrets = family.scaleFretsByString.flat();
        const startFret = Math.min(...familyFrets);
        const endFret = Math.max(...familyFrets);
        const x = (xForFret(startFret) + xForFret(endFret)) / 2;
        const labelY = 350;
        const state = !focusFamily ? "all" : focusFamily.position === family.position ? "active" : "context";
        const accent = state === "active" ? "#334155" : family.accent || "#64748b";
        return `<g class="overview-position-anchor ${state}" data-position-anchor="${family.position}">`
          + `<title>P${family.position}, ${esc(family.cagedForm)}-form physical position; not a mode assignment</title>`
          + `<line class="overview-anchor-leader" style="stroke:${accent}" x1="${x}" y1="${OVERVIEW_PLOT.bottom + 20}" x2="${x}" y2="${labelY - 16}"/>`
          + `<text class="overview-anchor-label" style="fill:${accent}" x="${x}" y="${labelY}">P${family.position} · ${esc(family.cagedForm)}-form</text>`
          + "</g>";
      }).join("");

    const lowEStringIndex = overviewData.strings.findIndex((string) => string.number === 6);
    const modalAnchorCallouts = context.modes
      .slice()
      .sort((a, b) => a.degreeIndex - b.degreeIndex)
      .map((mode, index) => {
        const x = xForFret(mode.anchor.fret);
        const y = yForString(lowEStringIndex);
        const labelY = index % 2 === 0 ? 410 : 460;
        const state = mode.key === focusMode.key ? "active" : "context";
        return `<g class="overview-modal-anchor ${state}" data-modal-anchor="${mode.key}"${state === "active" ? ' data-selected-modal-anchor="true"' : ""}>`
          + `<title>${esc(mode.numeral)} ${esc(mode.tonic)} ${esc(mode.name)} modal root on low E, fret ${mode.anchor.fret}</title>`
          + (showFullNeckPentatonic ? "" : `<circle class="overview-modal-anchor-ring" style="stroke:${mode.accent}" cx="${x}" cy="${y}" r="17"/>`)
          + `<line class="overview-anchor-leader" style="stroke:${mode.accent}" x1="${x}" y1="${y + 20}" x2="${x}" y2="${labelY - 16}"/>`
          + `<text class="overview-anchor-label" style="fill:${mode.accent}" x="${x}" y="${labelY}">${esc(mode.numeral)} · ${esc(mode.tonic)} ${esc(mode.name)}</text>`
          + "</g>";
      }).join("");

    const characteristicDegrees = focusMode.characteristicDegrees.map(prettyDegree).join(" + ");
    const modalTonicFormula = modalTonicChord.degrees.map(prettyDegree).join(" + ");
    const pentatonicCoreFormula = labelMode.tones.filter((tone) => tone.core)
      .map((tone) => prettyDegree(tone.degree)).join(" + ");
    const modalColorDegrees = labelMode.tones.filter((tone) => !tone.core)
      .map((tone) => prettyDegree(tone.degree)).join(" + ");
    const modeFormula = (view === "pentatonic" ? labelMode.tones.filter((tone) => tone.core) : labelMode.tones)
      .map((tone) => prettyDegree(tone.degree)).join("  ");
    const positionLabel = focusFamily
      ? `P${focusFamily.position} ${focusFamily.cagedForm}-form region`
      : "all 5 CAGED positions";
    const overlayScope = focusFamily
      ? `within P${focusFamily.position} ${focusFamily.cagedForm}-form`
      : "across the displayed fretboard";
    const viewCaption = showFullNeckPentatonic
      ? `Mode ${focusMode.numeral} · ${focusMode.tonic} ${focusMode.name} · relative parent ${overviewData.parentScale.tonic} major · ${pentatonicDisplayName(focusMode)} across frets ${minFret}–${maxFret} · ${focusFamily ? `P${focusFamily.position} outline is a guide` : "all positions shown"}`
      : `Mode ${focusMode.numeral} · ${focusMode.tonic} ${focusMode.name} · relative parent ${overviewData.parentScale.tonic} major · ${positionLabel} · pentatonic core filled; hollow ${modalColorDegrees} are modal color tones`;
    let learningCaption = "";
    let learningCaptionColor = "#4b5563";
    if (showFullNeckPentatonic) {
      learningCaption = `Pentatonic only · ${pentatonicCoreFormula} · non-core mode tones hidden · ${focusMode.pentatonicNote ? "no single standard Locrian pentatonic" : focusFamily ? `P${focusFamily.position} is only a position guide` : "all displayed positions"}`;
      learningCaptionColor = focusMode.accent;
    } else if (overviewOverlay === "characteristic") {
      learningCaption = `${focusMode.characteristicDegrees.length === 1 ? "Characteristic tone" : "Characteristic tones"} · ${characteristicDegrees} · ${overlayScope}`;
      learningCaptionColor = "#92400e";
    } else if (modalTonicKind) {
      learningCaption = `${modalTonicChord.heading} · ${modalTonicFormula} · ${overlayScope}${modalTonicKind === "seventh" ? ` · outlined ${prettyDegree(focusMode.tones[6].degree)} extends the triad` : ""}`;
      learningCaptionColor = "#5b21b6";
    } else if (overviewOverlay === "caged") {
      learningCaption = focusFamily
        ? `Parent-major CAGED chord · P${focusFamily.position} ${focusFamily.cagedForm}-form ${overviewData.parentScale.tonic} major · 1 + 3 + 5 · teal uses parent intervals`
        : `Parent-major CAGED chords · all E–D–C–A–G forms · ${overviewData.parentScale.tonic} major · 1 + 3 + 5 · teal uses parent intervals`;
      learningCaptionColor = "#0f766e";
    } else {
      learningCaption = focusFamily
        ? `Tonic roots ringed · P${focusFamily.position} changes location, not mode · ${focusMode.tonic} remains 1`
        : `Tonic roots ringed · all five position families · ${focusMode.tonic} remains 1`;
    }
    const overlayDescription = showFullNeckPentatonic
      ? ` The selected five-note core is shown across the displayed fretboard while non-core notes are hidden. Position contours remain navigation guides, not pentatonic box boundaries.${focusMode.pentatonicNote ? " This Locrian-compatible subset is project-defined rather than a standard named pentatonic." : ""}`
      : overviewOverlay === "caged"
      ? ` The ${focusFamily ? `${focusFamily.cagedForm}-form` : "five E-D-C-A-G"} ${overviewData.parentScale.tonic} major chord reference ${focusFamily ? "shape is" : "shapes are"} highlighted. Teal notes use parent-major chord degrees 1, 3, and 5; all other interval labels remain relative to ${focusMode.tonic}.`
      : modalTonicKind
        ? ` Every ${focusMode.tonic} ${modalTonicKind === "seventh" ? focusMode.tonicChord.seventhQuality : focusMode.tonicChord.triadQuality} modal tonic ${modalTonicKind === "seventh" ? "seventh-chord" : "triad"} target ${focusFamily ? "inside the selected position" : "across the displayed fretboard"} is highlighted. This is a chord-tone map, not a single chord voicing.`
        : "";
    const viewDescription = showFullNeckPentatonic
      ? " Every occurrence of the selected mode's five-note core is emphasized from the lowest through highest displayed fret."
      : ` Filled notes ${focusFamily ? "inside the selected position" : "across all five positions"} form the pentatonic core; hollow notes are full-mode color tones outside that core.`;
    const rootDescription = pentatonicRoots
      ? ` ${pentatonicRoots.major.tonic} major pentatonic and ${pentatonicRoots.minor.tonic} minor pentatonic share these five notes. ${rootKinds.map((kind) => `${kind === "major" ? "Blue circles" : "Purple squares"} mark every ${pentatonicRoots[kind].tonic} ${kind} pentatonic root`).join("; ")}. Interval labels remain relative to ${focusMode.tonic}.`
      : "";
    const description = `A continuous ${overviewData.parentScale.tonic} major fretboard from fret ${minFret} through ${maxFret}, labeled relative to ${focusMode.tonic} for ${focusMode.name}. ${focusFamily ? `P${focusFamily.position} ${focusFamily.cagedForm}-form is emphasized while other positions remain as context.` : "All five mode-independent CAGED position families are shown equally."} Seven Roman-numeral modal anchors and five P-numbered CAGED regions are labeled separately.${viewDescription}${overlayDescription}${rootDescription}`;
    const rootLegend = pentatonicRoots ? rootKinds.map((kind, index) =>
      `<g transform="translate(${OVERVIEW_PLOT.left + 10 + index * 260} 81)">`
        + pentatonicRootMarker(kind, 8)
        + `<text class="overview-learning-caption" x="18" y="4">${esc(pentatonicRoots[kind].tonic)} ${kind} pentatonic root</text></g>`
    ).join("") + `<text class="overview-learning-caption" x="${OVERVIEW_PLOT.left + rootKinds.length * 260 + 10}" y="85">Same five notes · intervals from ${esc(focusMode.tonic)} (1)</text>` : "";
    const positionDescription = families.map((family) => `P${family.position}, ${family.cagedForm}-form`).join("; ");
    const modalDescription = context.modes.map((mode) => `${mode.numeral} ${mode.tonic} ${mode.name}, low-E fret ${mode.anchor.fret}`).join("; ");
    const parentSlug = slug(overviewData.parentScale.tonic);
    const titleId = `relative-mode-overview-${parentSlug}-${focusMode.key}-p${positionId}-title`;
    const descId = `relative-mode-overview-${parentSlug}-${focusMode.key}-p${positionId}-desc`;
    return `<svg xmlns="http://www.w3.org/2000/svg" class="overview-svg is-mode-focused${focusFamily ? " is-position-focused" : ""}" width="15in" height="5.208in" viewBox="0 0 ${OVERVIEW_WIDTH} ${OVERVIEW_HEIGHT}" role="img" aria-labelledby="${titleId} ${descId}" data-diagram="overview" data-parent-key="${parentSlug}" data-parent-pitch-class="${context.parentKey.pitchClass}" data-mode="${focusMode.key}" data-tonic-pitch-class="${focusMode.tonicPitchClass}" data-position="${positionId}" data-overlay="${overviewOverlay}" data-view="${view}"${pentatonicRoots ? ` data-pentatonic-roots="${rootSelection}"` : ""}${showFullNeckPentatonic ? ' data-pentatonic-scope="full-neck"' : ""} data-fret-min="${minFret}" data-fret-max="${maxFret}">`
      + `<title id="${titleId}">Connected positions — ${esc(focusMode.tonic)} ${esc(focusMode.name)} — ${focusFamily ? `P${focusFamily.position} ${esc(focusFamily.cagedForm)}-form` : "all positions"}</title>`
      + `<desc id="${descId}">${esc(`${description} CAGED regions: ${positionDescription}. Modal anchors: ${modalDescription}.`)}</desc>`
      + `<style>
        .overview-svg{background:#fff;color:#111827;font-family:Inter,Segoe UI,Arial,sans-serif;text-rendering:geometricPrecision}
        .overview-svg .overview-title{font-size:25px;font-weight:700;fill:#111827}.overview-svg .overview-formula{font-size:15px;font-weight:700;fill:#111827;text-anchor:end}.overview-svg .overview-view-caption{font-size:14px;fill:#4b5563}.overview-svg .overview-learning-caption{font-size:13px;font-weight:650}
        .overview-svg .overview-fret,.overview-svg .overview-string{stroke:#6b7280;vector-effect:non-scaling-stroke}.overview-svg .overview-fret{stroke-width:1}.overview-svg .overview-fret.landmark{stroke-width:2.5}.overview-svg .overview-string{stroke-linecap:round}
        .overview-svg .overview-fret-label,.overview-svg .overview-string-label{font-size:12px;fill:#4b5563;text-anchor:middle;dominant-baseline:middle}.overview-svg .overview-fret-label.landmark{font-weight:700;fill:#111827}.overview-svg .overview-string-label{text-anchor:end}
        .overview-svg .overview-contour-path{fill:none;stroke-linejoin:round;vector-effect:non-scaling-stroke}.overview-svg .overview-contour.family .overview-contour-path{stroke-width:4;opacity:.9}.overview-svg .overview-contour.context .overview-contour-path{stroke-width:1.5;opacity:.62}.overview-svg .overview-contour.active .overview-contour-path{fill-opacity:.035;stroke-width:5;opacity:1}.overview-svg[data-pentatonic-scope="full-neck"] .overview-contour.context .overview-contour-path{opacity:.18}
        .overview-svg .overview-disc{fill:#fff;stroke:#4b5563;stroke-width:1.6;vector-effect:non-scaling-stroke}.overview-svg .overview-degree{font-size:11px;font-weight:700;fill:#111827;text-anchor:middle;dominant-baseline:middle}.overview-svg.is-position-focused .overview-note{opacity:.32}.overview-svg.is-position-focused .overview-note.inside,.overview-svg.is-position-focused .overview-note.root,.overview-svg.is-position-focused .overview-note.caged-chord,.overview-svg.is-position-focused .overview-note.pentatonic-across-neck{opacity:1}.overview-svg .overview-note.omitted,.overview-svg .overview-note.pentatonic-hidden{display:none}.overview-svg .overview-note.inside .overview-disc,.overview-svg .overview-note.pentatonic-across-neck .overview-disc{fill:#111827;stroke:#111827}.overview-svg .overview-note.inside .overview-degree,.overview-svg .overview-note.pentatonic-across-neck .overview-degree{fill:#fff}.overview-svg .overview-note.inside.optional .overview-disc{fill:#fff;stroke:#111827}.overview-svg .overview-note.inside.optional .overview-degree{fill:#111827}.overview-svg .overview-note.characteristic .overview-disc{fill:#fff;stroke:#b45309;stroke-width:4.5}.overview-svg .overview-note.characteristic .overview-degree{fill:#111827}.overview-svg .overview-note.modal-tonic-chord .overview-disc{fill:#6d28d9;stroke:#5b21b6;stroke-width:1.8}.overview-svg .overview-note.modal-tonic-chord .overview-degree{fill:#fff}.overview-svg .overview-note.modal-tonic-chord.added-seventh.core .overview-disc,.overview-svg .overview-note.modal-tonic-chord.added-seventh.equal .overview-disc{fill:#111827;stroke:#6d28d9;stroke-width:4}.overview-svg .overview-note.modal-tonic-chord.added-seventh.optional .overview-disc{fill:#fff;stroke:#6d28d9;stroke-width:4}.overview-svg .overview-note.modal-tonic-chord.added-seventh.optional .overview-degree{fill:#5b21b6}.overview-svg .overview-note.caged-chord .overview-disc{fill:#0f766e;stroke:#0f766e}.overview-svg .overview-note.caged-chord .overview-degree{fill:#fff}.overview-svg .overview-root-ring{fill:none;stroke-width:3;vector-effect:non-scaling-stroke}
        .overview-svg .overview-anchor-leader{stroke-width:1.35;vector-effect:non-scaling-stroke}.overview-svg .overview-anchor-label{font-size:12.5px;font-weight:700;text-anchor:middle;paint-order:stroke;stroke:#fff;stroke-width:4px;stroke-linejoin:round}.overview-svg .overview-map-row-label{font-size:11px;font-weight:800;fill:#64748b;letter-spacing:.06em;text-transform:uppercase}.overview-svg .overview-position-anchor.context{opacity:.3}.overview-svg .overview-position-anchor.active,.overview-svg .overview-position-anchor.all{opacity:1}.overview-svg .overview-modal-anchor-ring{fill:none;stroke-width:2.5;vector-effect:non-scaling-stroke}.overview-svg .overview-modal-anchor.context{opacity:.52}.overview-svg .overview-modal-anchor.active{opacity:1}.overview-svg[data-pentatonic-scope="full-neck"] .overview-position-anchor.context{opacity:.15}.overview-svg[data-pentatonic-scope="full-neck"] .overview-modal-anchor.context{opacity:.28}${pentatonicRoots ? `
        .overview-svg .overview-pentatonic-root{fill:none;stroke-width:3;vector-effect:non-scaling-stroke}.overview-svg .overview-pentatonic-root.major{stroke:#0369a1}.overview-svg .overview-pentatonic-root.minor{stroke:#a21caf}.overview-svg .overview-note.pentatonic-major-root .overview-disc{fill:#0369a1;stroke:#0369a1}.overview-svg .overview-note.pentatonic-minor-root .overview-disc{fill:#a21caf;stroke:#a21caf}` : ""}
      </style>`
      + `<rect width="${OVERVIEW_WIDTH}" height="${OVERVIEW_HEIGHT}" fill="#fff"/>`
      + `<text class="overview-title" x="${OVERVIEW_PLOT.left}" y="34">How the boxes connect</text>`
      + `<text class="overview-formula" x="${OVERVIEW_PLOT.right}" y="39">${esc(modeFormula)}</text>`
      + `<text class="overview-view-caption" x="${OVERVIEW_PLOT.left}" y="61">${esc(viewCaption)}</text>`
      + (rootLegend || `<text class="overview-learning-caption" style="fill:${learningCaptionColor}" x="${OVERVIEW_PLOT.left}" y="85">${esc(learningCaption)}</text>`)
      + familyContours + activeContour + fretLines.join("") + strings + fretLabels.join("") + notes
      + `<text class="overview-map-row-label" x="${OVERVIEW_PLOT.left}" y="350">CAGED positions</text>`
      + positionCallouts
      + `<text class="overview-map-row-label" x="${OVERVIEW_PLOT.left}" y="410">Relative modes</text>`
      + modalAnchorCallouts
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

  function overviewFileStem(data, requestedTonicPitchClass, requestedMode, requestedPosition = "all", requestedOverlay = "none", requestedPentatonicRoots = "both") {
    if (!Number.isInteger(Number(requestedTonicPitchClass))) {
      requestedOverlay = requestedPosition === undefined ? "none" : requestedPosition;
      requestedPosition = requestedMode === undefined ? "all" : requestedMode;
      requestedMode = requestedTonicPitchClass;
      const template = overviewModeTemplate(data, requestedMode) || overviewModeTemplate(data, "ionian");
      requestedTonicPitchClass = template ? template.tonicPitchClass : data.parentScale.pitchClasses[0];
    }
    const context = deriveOverviewContext(data, {
      tonicPitchClass: Number(requestedTonicPitchClass),
      mode: requestedMode
    });
    const family = overviewPositionFamily(context.data, requestedPosition);
    const overlay = normalizeOverviewOverlay(requestedOverlay, false);
    const position = family ? `p${family.position}-${family.cagedForm.toLowerCase()}-form` : "all-positions";
    const roots = overlay === "pentatonic" && pentatonicRootsFor(context.data, context.selectedMode)
      ? `-${normalizePentatonicRoots(requestedPentatonicRoots)}-roots` : "";
    return `${slug(context.parentKey.tonic)}-parent-${slug(context.selectedMode.tonic)}-${context.selectedMode.key}-${position}${overlay === "none" ? "" : `-${overlay}`}${roots}-connected-map`;
  }

  return {
    renderModeSvg,
    renderOverviewSvg,
    collectEntries,
    toneFor,
    exportFileStem,
    prettyDegree,
    pentatonicDisplayName,
    pentatonicRootsFor,
    modeViewSummary,
    overlayFor,
    deriveOverviewContext,
    overviewModeTemplate,
    majorKeyFor,
    modeKeyFor,
    overviewFocusMode,
    overviewPositionFamily,
    overviewFileStem,
    normalizeView,
    normalizeOverlay,
    normalizeFretSpacing,
    normalizeOverviewOverlay,
    modeFretGeometry,
    modeMarkerGeometry: MODE_MARKER_GEOMETRY
  };
}));
