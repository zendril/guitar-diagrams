(function runApp() {
  "use strict";

  const defaultData = window.GuitarDiagramData;
  const renderer = window.GuitarDiagramRenderer;
  const overviewFrame = document.getElementById("overview-frame");
  const overviewTonicControl = document.getElementById("overview-tonic");
  const overviewModeControl = document.getElementById("overview-mode");
  const overviewPositionControl = document.getElementById("overview-position");
  const overviewOverlayControl = document.getElementById("overview-overlay");
  const pentatonicRootControls = document.getElementById("pentatonic-root-controls");
  const overviewPentatonicRootsControl = document.getElementById("overview-pentatonic-roots");
  const pentatonicRootHelp = document.getElementById("pentatonic-root-help");
  const overviewSelectionSummary = document.getElementById("overview-selection-summary");
  const status = document.getElementById("status");
  const importInput = document.getElementById("import-project");
  const modeReferenceBody = document.getElementById("mode-reference-body");
  const cagedReference = document.getElementById("caged-reference");
  const pageViews = document.querySelectorAll("[data-page-view]");
  const pageLinks = document.querySelectorAll("[data-page-link]");
  const storageKey = "guitar-diagrams-project-v2";
  const majorScaleOffsets = [0, 2, 4, 5, 7, 9, 11];
  const defaultTonicPitchClass = Number.isInteger(defaultData.parentScale.tonicPitchClass)
    ? defaultData.parentScale.tonicPitchClass
    : defaultData.parentScale.pitchClasses[0];

  let project = loadSavedProject() || {
    schemaVersion: 1,
    settings: {
      overviewTonicPitchClass: defaultTonicPitchClass,
      overviewMode: "ionian",
      overviewPosition: "all",
      overviewOverlay: "characteristic",
      overviewPentatonicRoots: "both"
    },
    data: structuredClone(defaultData)
  };

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function loadSavedProject() {
    let saved;
    try {
      saved = localStorage.getItem(storageKey);
    } catch (error) {
      status.textContent = "Automatic browser saving is unavailable; use Download project JSON to save edits.";
      return null;
    }
    if (!saved) return null;
    try {
      const parsed = normalizeProject(JSON.parse(saved));
      validateProject(parsed);
      preflightProject(parsed);
      return parsed;
    } catch (error) {
      try { localStorage.removeItem(storageKey); } catch (storageError) { /* Continue in memory. */ }
      return null;
    }
  }

  function modeKeyFor(mode) {
    return String(mode && (mode.key || mode.modeKey || mode.name) || "")
      .trim()
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/^-|-$/g, "");
  }

  function hydrateMissing(target, source) {
    if (!target || !source || typeof target !== "object" || typeof source !== "object") return;
    for (const [key, value] of Object.entries(source)) {
      if (target[key] === undefined) {
        target[key] = structuredClone(value);
      } else if (value && target[key] && !Array.isArray(value)
        && typeof value === "object" && typeof target[key] === "object") {
        hydrateMissing(target[key], value);
      }
    }
  }

  function genericModeKey(value, modes) {
    if (!value || value === "all") return "ionian";
    const normalizedValue = String(value).toLowerCase();
    const matchingMode = modes.find((mode) => mode.id === value
      || modeKeyFor(mode) === normalizedValue
      || String(mode.name).toLowerCase() === normalizedValue);
    return matchingMode ? modeKeyFor(matchingMode) : normalizedValue.replace(/^[a-g](?:s|f)?-/, "");
  }

  function normalizeProject(candidate) {
    const normalized = structuredClone(candidate);
    if (!normalized || !normalized.settings || !normalized.data) return normalized;

    hydrateMissing(normalized.data, defaultData);
    normalized.data.sourceRevision = defaultData.sourceRevision;
    if (Array.isArray(normalized.data.modes)) {
      for (const mode of normalized.data.modes) {
        const key = modeKeyFor(mode);
        const matchingDefault = defaultData.modes.find((candidateMode) => candidateMode.id === mode.id
          || modeKeyFor(candidateMode) === key);
        if (matchingDefault) hydrateMissing(mode, matchingDefault);
      }
    }
    if (Array.isArray(normalized.data.positionFamilies)) {
      for (const family of normalized.data.positionFamilies) {
        const matchingDefault = defaultData.positionFamilies.find((candidateFamily) => candidateFamily.position === family.position);
        if (matchingDefault) hydrateMissing(family, matchingDefault);
      }
    }

    const projectModes = Array.isArray(normalized.data.modes) ? normalized.data.modes : [];
    const legacyOverviewFocus = normalized.settings.overviewFocus;
    const previousMode = normalized.settings.overviewMode !== undefined
      ? normalized.settings.overviewMode
      : legacyOverviewFocus;
    const legacySpecificMode = projectModes.find((mode) => mode.id === previousMode);
    const previousModeDefinition = projectModes.find((mode) => mode.id === previousMode
      || modeKeyFor(mode) === String(previousMode || "").toLowerCase());
    const referenceParentPitchClass = Number.isInteger(normalized.settings.overviewParentPitchClass)
      ? normalized.settings.overviewParentPitchClass
      : Number.isInteger(normalized.data.parentScale.tonicPitchClass)
        ? normalized.data.parentScale.tonicPitchClass
        : normalized.data.parentScale.pitchClasses[0];
    const normalizedModeKey = genericModeKey(previousMode, projectModes);
    const genericModeDefinition = projectModes.find((mode) => modeKeyFor(mode) === normalizedModeKey)
      || projectModes[0];
    const degreeIndex = genericModeDefinition && Number.isInteger(genericModeDefinition.degreeIndex)
      ? genericModeDefinition.degreeIndex
      : 0;

    if (!Number.isInteger(normalized.settings.overviewTonicPitchClass)) {
      normalized.settings.overviewTonicPitchClass = legacySpecificMode
        ? legacySpecificMode.tonicPitchClass
        : (referenceParentPitchClass + majorScaleOffsets[degreeIndex]) % 12;
    }
    normalized.settings.overviewMode = normalizedModeKey;
    if (normalized.settings.overviewPosition === undefined) {
      normalized.settings.overviewPosition = previousModeDefinition && legacyOverviewFocus !== "all"
        ? previousModeDefinition.position
        : "all";
    }
    if (normalized.settings.overviewOverlay === undefined) {
      normalized.settings.overviewOverlay = normalized.settings.overviewCharacteristic === false ? "none" : "characteristic";
    }
    if (normalized.settings.overviewPentatonicRoots === undefined) {
      normalized.settings.overviewPentatonicRoots = "both";
    }

    delete normalized.settings.overviewFocus;
    delete normalized.settings.overviewParentPitchClass;
    delete normalized.settings.overviewCharacteristic;
    delete normalized.settings.view;
    delete normalized.settings.overlay;
    delete normalized.settings.fretSpacing;
    return normalized;
  }

  function validateProject(candidate) {
    if (!candidate || candidate.schemaVersion !== 1 || !candidate.settings || !candidate.data) {
      throw new Error("This is not a version 1 guitar-diagram project.");
    }
    if (!Array.isArray(candidate.data.modes) || candidate.data.modes.length !== 7) {
      throw new Error("The project must contain seven mode definitions.");
    }
    const overviewModes = new Set(candidate.data.modes.map(modeKeyFor));
    if (!Number.isInteger(candidate.settings.overviewTonicPitchClass)
      || candidate.settings.overviewTonicPitchClass < 0
      || candidate.settings.overviewTonicPitchClass > 11
      || !overviewModes.has(candidate.settings.overviewMode)
      || !["none", "pentatonic", "characteristic", "triad", "seventh", "caged"].includes(candidate.settings.overviewOverlay)
      || !["both", "major", "minor"].includes(candidate.settings.overviewPentatonicRoots)) {
      throw new Error("The project contains unsupported display settings.");
    }
    if (!Array.isArray(candidate.data.strings) || candidate.data.strings.length !== 6) {
      throw new Error("The project must define six strings.");
    }
    if (!candidate.data.pitchClassNames || !candidate.data.parentScale
      || !Array.isArray(candidate.data.parentScale.pitchClasses)) {
      throw new Error("The project is missing pitch-class or parent-scale data.");
    }
    if (!Array.isArray(candidate.data.majorKeys) || candidate.data.majorKeys.length !== 12
      || new Set(candidate.data.majorKeys.map((key) => key && key.pitchClass)).size !== 12
      || candidate.data.majorKeys.some((key) => !key || !Number.isInteger(key.pitchClass)
        || key.pitchClass < 0 || key.pitchClass > 11 || typeof key.tonic !== "string"
        || key.tonic.length === 0 || !Array.isArray(key.notes) || key.notes.length !== 7
        || key.notes.some((note) => typeof note !== "string" || note.length === 0))) {
      throw new Error("The project must define a valid spelling for all twelve parent major keys.");
    }
    if (!Array.isArray(candidate.data.positionFamilies) || candidate.data.positionFamilies.length !== 5) {
      throw new Error("The project must define five CAGED position families.");
    }

    const familyPositions = new Set();
    const cagedForms = new Set();
    for (const family of candidate.data.positionFamilies) {
      if (!family || !Number.isInteger(family.position) || family.position < 1
        || familyPositions.has(family.position) || !/^[CAGED]$/.test(family.cagedForm)
        || cagedForms.has(family.cagedForm)
        || !/^#[0-9a-f]{6}$/i.test(family.accent)
        || !Array.isArray(family.scaleFretsByString) || family.scaleFretsByString.length !== 6
        || family.scaleFretsByString.some((frets) => !Array.isArray(frets) || frets.length === 0
          || frets.some((fret) => !Number.isInteger(fret) || fret < 0 || fret > 30)
          || new Set(frets).size !== frets.length)
        || !Array.isArray(family.chordFretsByString) || family.chordFretsByString.length !== 6
        || family.chordFretsByString.flat().length < 4
        || family.chordFretsByString.some((frets) => !Array.isArray(frets) || frets.length > 1
          || frets.some((fret) => !Number.isInteger(fret) || fret < 0 || fret > 30))) {
        throw new Error("Every position family needs a unique position and CAGED form.");
      }
      familyPositions.add(family.position);
      cagedForms.add(family.cagedForm);
    }
    if (candidate.settings.overviewPosition !== "all"
      && !familyPositions.has(candidate.settings.overviewPosition)) {
      throw new Error("The project contains an unsupported overview position.");
    }

    const ids = new Set();
    const modeKeys = new Set();
    const degreeIndices = new Set();
    for (const [stringIndex, string] of candidate.data.strings.entries()) {
      if (!Number.isInteger(string.number) || string.number !== stringIndex + 1
        || !Number.isInteger(string.openPitchClass) || string.openPitchClass < 0 || string.openPitchClass > 11
        || typeof string.name !== "string" || string.name.length > 8) {
        throw new Error(`String definition ${stringIndex + 1} is invalid.`);
      }
    }
    const parentChordPitchClasses = new Set([
      candidate.data.parentScale.pitchClasses[0],
      candidate.data.parentScale.pitchClasses[2],
      candidate.data.parentScale.pitchClasses[4]
    ]);
    const parentScalePitchClasses = new Set(candidate.data.parentScale.pitchClasses);
    for (const family of candidate.data.positionFamilies) {
      for (const [stringIndex, frets] of family.scaleFretsByString.entries()) {
        for (const fret of frets) {
          const pc = (candidate.data.strings[stringIndex].openPitchClass + fret) % 12;
          if (!parentScalePitchClasses.has(pc)) {
            throw new Error(`Position ${family.position} contains a note outside the parent scale.`);
          }
        }
      }
      for (const [stringIndex, frets] of family.chordFretsByString.entries()) {
        for (const fret of frets) {
          const pc = (candidate.data.strings[stringIndex].openPitchClass + fret) % 12;
          if (!parentChordPitchClasses.has(pc)) {
            throw new Error(`Position ${family.position} contains a note outside the parent-major CAGED chord.`);
          }
          if (!family.scaleFretsByString[stringIndex].includes(fret)) {
            throw new Error(`Position ${family.position} CAGED chord tones must stay inside its scale contour.`);
          }
        }
      }
    }
    for (const mode of candidate.data.modes) {
      const modeKey = modeKeyFor(mode);
      if (typeof mode.id !== "string" || !/^[a-z0-9-]+$/.test(mode.id) || ids.has(mode.id)) {
        throw new Error("Every mode needs a unique lowercase identifier.");
      }
      if (!modeKey || modeKeys.has(modeKey)) {
        throw new Error("Every mode needs a unique generic mode key.");
      }
      ids.add(mode.id);
      modeKeys.add(modeKey);
      for (const property of ["name", "tonic", "numeral", "pentatonicName"]) {
        if (typeof mode[property] !== "string" || mode[property].length === 0 || mode[property].length > 80) {
          throw new Error(`${mode.id} has an invalid ${property}.`);
        }
      }
      if (!/^#[0-9a-f]{6}$/i.test(mode.accent)) throw new Error(`${mode.id} has an invalid accent color.`);
      if (!Number.isInteger(mode.tonicPitchClass) || mode.tonicPitchClass < 0 || mode.tonicPitchClass > 11
        || !Number.isInteger(mode.degreeIndex) || mode.degreeIndex < 0 || mode.degreeIndex > 6
        || degreeIndices.has(mode.degreeIndex)
        || !Number.isInteger(mode.position) || !mode.anchor
        || !Number.isInteger(mode.anchor.string) || !Number.isInteger(mode.anchor.fret)) {
        throw new Error(`${mode.id} has invalid tonic, position, or anchor data.`);
      }
      degreeIndices.add(mode.degreeIndex);
      if (!Array.isArray(mode.tones) || mode.tones.length !== 7
        || mode.tones.filter((tone) => tone && tone.core === true).length !== 5
        || mode.tones.some((tone) => !tone || !Number.isInteger(tone.semitones)
          || tone.semitones < 0 || tone.semitones > 11 || typeof tone.degree !== "string" || tone.degree.length > 4
          || typeof tone.core !== "boolean")) {
        throw new Error(`${mode.id} must define seven tones and exactly five pentatonic-core tones.`);
      }
      const degreeSet = new Set(mode.tones.map((tone) => tone.degree));
      if (!Array.isArray(mode.characteristicDegrees) || mode.characteristicDegrees.length === 0
        || mode.characteristicDegrees.some((degree) => typeof degree !== "string" || !degreeSet.has(degree))) {
        throw new Error(`${mode.id} has invalid characteristic-tone data.`);
      }
      if (!mode.tonicChord || typeof mode.tonicChord.triadQuality !== "string"
        || mode.tonicChord.triadQuality.length === 0 || mode.tonicChord.triadQuality.length > 40
        || typeof mode.tonicChord.seventhQuality !== "string"
        || mode.tonicChord.seventhQuality.length === 0 || mode.tonicChord.seventhQuality.length > 60) {
        throw new Error(`${mode.id} has invalid tonic-chord data.`);
      }
      if (!Array.isArray(mode.fretsByString) || mode.fretsByString.length !== 6
        || mode.fretsByString.some((frets) => !Array.isArray(frets) || frets.length === 0
          || frets.some((fret) => !Number.isInteger(fret) || fret < 0 || fret > 30)
          || new Set(frets).size !== frets.length)) {
        throw new Error(`${mode.id} has invalid per-string fret selections.`);
      }
    }
    if (degreeIndices.size !== 7) {
      throw new Error("The seven mode definitions must cover each relative degree exactly once.");
    }
    const modePositions = new Set(candidate.data.modes.map((mode) => mode.position));
    if (modePositions.size !== familyPositions.size
      || [...modePositions].some((position) => !familyPositions.has(position))) {
      throw new Error("Every modal contour must belong to one of the five CAGED position families.");
    }
  }

  function preflightProject(candidate) {
    renderer.deriveOverviewContext(candidate.data, {
      tonicPitchClass: candidate.settings.overviewTonicPitchClass,
      mode: candidate.settings.overviewMode
    });
    renderer.renderOverviewSvg(candidate.data, {
      tonicPitchClass: candidate.settings.overviewTonicPitchClass,
      mode: candidate.settings.overviewMode,
      position: candidate.settings.overviewPosition,
      overlay: candidate.settings.overviewOverlay,
      pentatonicRoots: candidate.settings.overviewPentatonicRoots
    });
  }

  function saveProject(message) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(project));
    } catch (error) {
      status.textContent = "Automatic browser saving is unavailable; use Download project JSON to save edits.";
      return;
    }
    if (message) status.textContent = message;
  }

  function pitchClassName(data, pitchClass) {
    const normalizedPitchClass = ((Number(pitchClass) % 12) + 12) % 12;
    return data.pitchClassNames[normalizedPitchClass] || String(normalizedPitchClass);
  }

  function contextParentName(context, data, pitchClass) {
    if (typeof context.parentKey === "string") return context.parentKey;
    if (context.parentKey && typeof context.parentKey === "object") {
      return context.parentKey.name || context.parentKey.tonic || context.parentKey.label
        || pitchClassName(data, pitchClass);
    }
    return pitchClassName(data, pitchClass);
  }

  function contextModeName(context, fallbackMode) {
    return context.selectedMode && context.selectedMode.name
      ? context.selectedMode.name
      : fallbackMode.name;
  }

  function contextTonicName(context, fallbackMode) {
    return context.selectedMode && (context.selectedMode.tonic || context.selectedMode.tonicName
      || context.selectedMode.root)
      || context.selectedTonic || context.selectedTonicName || context.tonicName || fallbackMode.tonic;
  }

  function currentOverviewContext(mode = project.settings.overviewMode) {
    return renderer.deriveOverviewContext(project.data, {
      tonicPitchClass: project.settings.overviewTonicPitchClass,
      mode
    });
  }

  function populateTonicOptions() {
    overviewTonicControl.innerHTML = Array.from({ length: 12 }, (_, pitchClass) => {
      let label = pitchClassName(project.data, pitchClass);
      try {
        const context = renderer.deriveOverviewContext(project.data, {
          tonicPitchClass: pitchClass,
          mode: project.settings.overviewMode
        });
        label = contextTonicName(context, project.data.modes[0]);
      } catch (error) {
        // The project validator reports an invalid context; keep the pitch-class fallback usable here.
      }
      return `<option value="${pitchClass}">${escapeHtml(label)}</option>`;
    }).join("");
    overviewTonicControl.value = String(project.settings.overviewTonicPitchClass);
  }

  function populateModeOptions() {
    overviewModeControl.innerHTML = project.data.modes.map((mode) => {
      const key = modeKeyFor(mode);
      return `<option value="${escapeHtml(key)}">${escapeHtml(mode.name)}</option>`;
    }).join("");
    overviewModeControl.value = project.settings.overviewMode;
  }

  function populateOverviewOptions() {
    populateModeOptions();
    populateTonicOptions();
    const families = [...project.data.positionFamilies].sort((a, b) => a.position - b.position);
    overviewPositionControl.innerHTML = `<option value="all">All 5 CAGED regions</option>`
      + families.map((family) => `<option value="${family.position}">P${family.position} · ${escapeHtml(family.cagedForm)}-form</option>`).join("");
  }

  function applyControls() {
    overviewTonicControl.value = String(project.settings.overviewTonicPitchClass);
    overviewModeControl.value = project.settings.overviewMode;
    overviewPositionControl.value = String(project.settings.overviewPosition);
    overviewOverlayControl.value = project.settings.overviewOverlay;
  }

  function renderSelectionSummary(context) {
    const selectedDefinition = project.data.modes.find((mode) => modeKeyFor(mode) === project.settings.overviewMode)
      || project.data.modes[0];
    const parentName = contextParentName(context, project.data, project.settings.overviewTonicPitchClass);
    const modeName = contextModeName(context, selectedDefinition);
    const tonicName = contextTonicName(context, selectedDefinition);
    const family = project.settings.overviewPosition === "all"
      ? null
      : project.data.positionFamilies.find((candidate) => candidate.position === project.settings.overviewPosition);
    const positionText = family
      ? `P${family.position} ${family.cagedForm}-form region`
      : "all five CAGED regions";
    const tonicLocation = Number.isInteger(context.selectedAnchorFret)
      ? ` · modal tonic on low-E fret ${context.selectedAnchorFret}`
      : "";
    overviewSelectionSummary.textContent = `${tonicName} ${modeName} · relative parent ${parentName} major${tonicLocation} · ${positionText}.`;
    if (project.settings.overviewOverlay === "pentatonic") {
      const roots = renderer.pentatonicRootsFor(context.data, context.selectedMode);
      const kinds = project.settings.overviewPentatonicRoots === "both" ? ["major", "minor"] : [project.settings.overviewPentatonicRoots];
      overviewSelectionSummary.textContent += roots
        ? ` Pentatonic roots: ${kinds.map((kind) => `${roots[kind].tonic} ${kind}`).join(" + ")}.`
        : ` Project-defined pentatonic: ${tonicName} tonic marked.`;
    }
  }

  function renderPentatonicRootControls(context) {
    pentatonicRootControls.hidden = project.settings.overviewOverlay !== "pentatonic";
    const roots = renderer.pentatonicRootsFor(context.data, context.selectedMode);
    overviewPentatonicRootsControl.disabled = !roots;
    if (!roots) {
      overviewPentatonicRootsControl.innerHTML = '<option value="both">Mode tonic only</option>';
      overviewPentatonicRootsControl.value = "both";
      pentatonicRootHelp.textContent = `This project-defined core has no standard relative major/minor pentatonic pair. The ring marks ${context.selectedMode.tonic}, the modal tonic.`;
      return;
    }
    overviewPentatonicRootsControl.innerHTML = [
      ["both", `Both — ${roots.major.tonic} major / ${roots.minor.tonic} minor`],
      ["major", `Major root — ${roots.major.tonic}`],
      ["minor", `Minor root — ${roots.minor.tonic}`]
    ].map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join("");
    overviewPentatonicRootsControl.value = project.settings.overviewPentatonicRoots;
    const markerDescriptions = [];
    if (project.settings.overviewPentatonicRoots !== "minor") markerDescriptions.push(`Blue circles mark ${roots.major.tonic}, the major root`);
    if (project.settings.overviewPentatonicRoots !== "major") markerDescriptions.push(`Purple squares mark ${roots.minor.tonic}, the minor root`);
    pentatonicRootHelp.textContent = `${roots.major.tonic} major and ${roots.minor.tonic} minor pentatonic share these five notes. ${markerDescriptions.join("; ")}. Interval labels still use ${context.selectedMode.tonic} as 1.`;
  }

  function renderOverview() {
    const options = {
      tonicPitchClass: project.settings.overviewTonicPitchClass,
      mode: project.settings.overviewMode,
      position: project.settings.overviewPosition,
      overlay: project.settings.overviewOverlay,
      pentatonicRoots: project.settings.overviewPentatonicRoots
    };
    const context = renderer.deriveOverviewContext(project.data, options);
    overviewFrame.innerHTML = renderer.renderOverviewSvg(project.data, options);
    renderPentatonicRootControls(context);
    renderSelectionSummary(context);
  }

  function renderTheoryReference() {
    const sortedFamilies = [...project.data.positionFamilies].sort((a, b) => a.position - b.position);
    cagedReference.innerHTML = sortedFamilies.map((family) => `<li><span>P${escapeHtml(family.position)}</span><strong>${escapeHtml(family.cagedForm)}-form</strong></li>`).join("");

    modeReferenceBody.innerHTML = project.data.modes.map((mode) => {
      const formula = mode.tones.map((tone) => renderer.prettyDegree(tone.degree)).join(" ");
      const identity = mode.characteristicDegrees.map(renderer.prettyDegree).join(" + ");
      const additions = mode.tones.filter((tone) => !tone.core).map((tone) => renderer.prettyDegree(tone.degree)).join(" + ");
      const coreFormula = mode.tones.filter((tone) => tone.core).map((tone) => tone.degree).join(" ");
      const coreName = coreFormula === "1 2 3 5 6"
        ? "Major pentatonic"
        : coreFormula === "1 b3 4 5 b7"
          ? "Minor pentatonic"
          : "Project subset";
      return `<tr>
        <td>${escapeHtml(mode.numeral)}</td>
        <th scope="row">${escapeHtml(mode.name)}</th>
        <td class="interval-cell">${escapeHtml(formula)}</td>
        <td>${escapeHtml(mode.tonicChord.triadQuality)} · ${escapeHtml(mode.tonicChord.seventhQuality)}</td>
        <td class="identity-cell">${escapeHtml(identity)}</td>
        <td>${escapeHtml(coreName)}<small> + ${escapeHtml(additions)}</small></td>
      </tr>`;
    }).join("");
  }

  function render() {
    renderOverview();
    renderTheoryReference();
  }

  function downloadBlob(content, type, filename) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function exportOverview() {
    const markup = renderer.renderOverviewSvg(project.data, {
      tonicPitchClass: project.settings.overviewTonicPitchClass,
      mode: project.settings.overviewMode,
      position: project.settings.overviewPosition,
      overlay: project.settings.overviewOverlay,
      pentatonicRoots: project.settings.overviewPentatonicRoots
    });
    const filename = `${renderer.overviewFileStem(
      project.data,
      project.settings.overviewTonicPitchClass,
      project.settings.overviewMode,
      project.settings.overviewPosition,
      project.settings.overviewOverlay,
      project.settings.overviewPentatonicRoots
    )}.svg`;
    downloadBlob(`<?xml version="1.0" encoding="UTF-8"?>\n${markup}\n`, "image/svg+xml;charset=utf-8", filename);
    status.textContent = `Exported the connected-position overview as ${filename}.`;
  }

  function clearPrintTarget() {
    document.body.classList.remove("print-single");
    document.querySelectorAll(".is-print-target").forEach((element) => element.classList.remove("is-print-target"));
  }

  function printOverview() {
    clearPrintTarget();
    document.body.classList.add("print-single");
    document.getElementById("overview").classList.add("is-print-target");
    window.print();
  }

  function pageNameFromHash() {
    return window.location.hash === "#cheat-sheet" ? "cheat-sheet" : "map";
  }

  function activatePage(moveFocus) {
    const activePage = pageNameFromHash();
    pageViews.forEach((view) => {
      view.hidden = view.dataset.pageView !== activePage;
    });
    pageLinks.forEach((link) => {
      if (link.dataset.pageLink === activePage) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    document.title = activePage === "cheat-sheet"
      ? "Theory Cheat Sheet · Guitar Diagrams"
      : "Relative Modes of the Major Scale";
    if (moveFocus) {
      const heading = document.querySelector(`[data-page-view="${activePage}"] [data-page-heading]`);
      if (heading) heading.focus({ preventScroll: false });
    }
  }

  overviewTonicControl.addEventListener("change", (event) => {
    project.settings.overviewTonicPitchClass = Number(event.target.value);
    saveProject();
    renderOverview();
  });

  overviewModeControl.addEventListener("change", (event) => {
    project.settings.overviewMode = event.target.value;
    populateTonicOptions();
    saveProject();
    renderOverview();
  });

  overviewPositionControl.addEventListener("change", (event) => {
    project.settings.overviewPosition = event.target.value === "all" ? "all" : Number(event.target.value);
    saveProject();
    renderOverview();
  });

  overviewOverlayControl.addEventListener("change", (event) => {
    project.settings.overviewOverlay = event.target.value;
    saveProject();
    renderOverview();
  });

  overviewPentatonicRootsControl.addEventListener("change", (event) => {
    project.settings.overviewPentatonicRoots = event.target.value;
    saveProject();
    renderOverview();
  });

  document.getElementById("export-overview").addEventListener("click", exportOverview);
  document.getElementById("print-overview").addEventListener("click", printOverview);
  document.getElementById("print-cheat-sheet").addEventListener("click", () => {
    clearPrintTarget();
    window.print();
  });

  document.getElementById("download-project").addEventListener("click", () => {
    downloadBlob(`${JSON.stringify(project, null, 2)}\n`, "application/json;charset=utf-8", "connected-mode-fretboard.json");
    status.textContent = "Downloaded the editable project JSON.";
  });

  document.getElementById("import-project-button").addEventListener("click", () => importInput.click());

  importInput.addEventListener("change", async () => {
    const [file] = importInput.files;
    if (!file) return;
    try {
      const candidate = normalizeProject(JSON.parse(await file.text()));
      validateProject(candidate);
      preflightProject(candidate);
      project = candidate;
      populateOverviewOptions();
      applyControls();
      render();
      saveProject(`Imported ${file.name}.`);
    } catch (error) {
      status.textContent = `Could not import project: ${error.message}`;
    } finally {
      importInput.value = "";
    }
  });

  window.addEventListener("afterprint", clearPrintTarget);
  window.addEventListener("hashchange", () => activatePage(true));
  window.addEventListener("pageshow", () => activatePage(false));
  populateOverviewOptions();
  applyControls();
  render();
  activatePage(false);
}());
