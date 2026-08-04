(function runApp() {
  "use strict";

  const defaultData = window.GuitarDiagramData;
  const renderer = window.GuitarDiagramRenderer;
  const overviewFrame = document.getElementById("overview-frame");
  const overviewFocusControl = document.getElementById("overview-focus");
  const overviewOverlayControl = document.getElementById("overview-overlay");
  const diagramsRoot = document.getElementById("diagrams");
  const legendRoot = document.getElementById("legend");
  const status = document.getElementById("status");
  const importInput = document.getElementById("import-project");
  const overlayControl = document.getElementById("overlay");
  const fretSpacingControl = document.getElementById("fret-spacing");
  const modeReferenceBody = document.getElementById("mode-reference-body");
  const cagedReference = document.getElementById("caged-reference");
  const pageViews = document.querySelectorAll("[data-page-view]");
  const pageLinks = document.querySelectorAll("[data-page-link]");
  const storageKey = "guitar-diagrams-project-v2";

  let project = loadSavedProject() || {
    schemaVersion: 1,
    settings: {
      view: "combined",
      overlay: "none",
      fretSpacing: "compact",
      overviewFocus: "all",
      overviewOverlay: "characteristic"
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

  function normalizeProject(candidate) {
    const normalized = structuredClone(candidate);
    if (normalized && normalized.settings && normalized.settings.overlay === undefined) {
      normalized.settings.overlay = "none";
    }
    if (normalized && normalized.settings && normalized.settings.fretSpacing === undefined) {
      normalized.settings.fretSpacing = "compact";
    }
    if (normalized && normalized.settings && normalized.settings.overviewFocus === undefined) {
      normalized.settings.overviewFocus = "all";
    }
    if (normalized && normalized.settings && normalized.settings.overviewOverlay === undefined) {
      normalized.settings.overviewOverlay = normalized.settings.overviewCharacteristic === false ? "none" : "characteristic";
    }
    if (normalized && normalized.settings) {
      delete normalized.settings.overviewCharacteristic;
    }
    if (normalized && normalized.data && Array.isArray(normalized.data.modes)) {
      for (const mode of normalized.data.modes) {
        const matchingDefault = defaultData.modes.find((candidateMode) => candidateMode.id === mode.id);
        if (!matchingDefault) continue;
        if (!Array.isArray(mode.characteristicDegrees)) {
          mode.characteristicDegrees = structuredClone(matchingDefault.characteristicDegrees);
        }
        if (!mode.tonicChord) mode.tonicChord = structuredClone(matchingDefault.tonicChord);
      }
    }
    if (normalized && normalized.data && !Array.isArray(normalized.data.positionFamilies)) {
      normalized.data.positionFamilies = structuredClone(defaultData.positionFamilies);
    } else if (normalized && normalized.data && Array.isArray(normalized.data.positionFamilies)) {
      for (const family of normalized.data.positionFamilies) {
        const matchingDefault = defaultData.positionFamilies.find((candidateFamily) => candidateFamily.position === family.position);
        if (matchingDefault && !Array.isArray(family.chordFretsByString)) {
          family.chordFretsByString = structuredClone(matchingDefault.chordFretsByString);
        }
      }
    }
    return normalized;
  }

  function validateProject(candidate) {
    if (!candidate || candidate.schemaVersion !== 1 || !candidate.settings || !candidate.data) {
      throw new Error("This is not a version 1 guitar-diagram project.");
    }
    if (!Array.isArray(candidate.data.modes) || candidate.data.modes.length !== 7) {
      throw new Error("The project must contain seven mode diagrams.");
    }
    const overviewFocuses = new Set(["all", ...candidate.data.modes.map((mode) => mode.id)]);
    if (!["full", "combined", "pentatonic"].includes(candidate.settings.view)
      || !["none", "characteristic", "triad", "seventh"].includes(candidate.settings.overlay)
      || !["compact", "guitar", "wide"].includes(candidate.settings.fretSpacing)
      || !overviewFocuses.has(candidate.settings.overviewFocus)
      || !["none", "characteristic", "triad", "caged"].includes(candidate.settings.overviewOverlay)) {
      throw new Error("The project contains unsupported display settings.");
    }
    if (!Array.isArray(candidate.data.strings) || candidate.data.strings.length !== 6) {
      throw new Error("The project must define six strings.");
    }
    if (!candidate.data.pitchClassNames || !candidate.data.parentScale
      || !Array.isArray(candidate.data.parentScale.pitchClasses)) {
      throw new Error("The project is missing pitch-class or parent-scale data.");
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
        || !Array.isArray(family.chordFretsByString) || family.chordFretsByString.length !== 6
        || family.chordFretsByString.flat().length < 4
        || family.chordFretsByString.some((frets) => !Array.isArray(frets) || frets.length > 1
          || frets.some((fret) => !Number.isInteger(fret) || fret < 0 || fret > 30))) {
        throw new Error("Every position family needs a unique position and CAGED form.");
      }
      familyPositions.add(family.position);
      cagedForms.add(family.cagedForm);
    }

    const ids = new Set();
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
    for (const family of candidate.data.positionFamilies) {
      for (const [stringIndex, frets] of family.chordFretsByString.entries()) {
        for (const fret of frets) {
          const pc = (candidate.data.strings[stringIndex].openPitchClass + fret) % 12;
          if (!parentChordPitchClasses.has(pc)) {
            throw new Error(`Position ${family.position} contains a note outside the parent-major CAGED chord.`);
          }
        }
      }
    }
    for (const mode of candidate.data.modes) {
      if (typeof mode.id !== "string" || !/^[a-z0-9-]+$/.test(mode.id) || ids.has(mode.id)) {
        throw new Error("Every mode needs a unique lowercase identifier.");
      }
      ids.add(mode.id);
      for (const property of ["name", "tonic", "numeral", "pentatonicName"]) {
        if (typeof mode[property] !== "string" || mode[property].length === 0 || mode[property].length > 80) {
          throw new Error(`${mode.id} has an invalid ${property}.`);
        }
      }
      if (!/^#[0-9a-f]{6}$/i.test(mode.accent)) throw new Error(`${mode.id} has an invalid accent color.`);
      if (!Number.isInteger(mode.tonicPitchClass) || mode.tonicPitchClass < 0 || mode.tonicPitchClass > 11
        || !Number.isInteger(mode.position) || !mode.anchor
        || !Number.isInteger(mode.anchor.string) || !Number.isInteger(mode.anchor.fret)) {
        throw new Error(`${mode.id} has invalid tonic, position, or anchor data.`);
      }
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
    const modePositions = new Set(candidate.data.modes.map((mode) => mode.position));
    if (modePositions.size !== familyPositions.size
      || [...modePositions].some((position) => !familyPositions.has(position))) {
      throw new Error("Every modal contour must belong to one of the five CAGED position families.");
    }
    for (const family of candidate.data.positionFamilies) {
      const familyModes = candidate.data.modes.filter((mode) => mode.position === family.position);
      for (const [stringIndex, frets] of family.chordFretsByString.entries()) {
        if (frets.some((fret) => familyModes.some((mode) => !mode.fretsByString[stringIndex].includes(fret)))) {
          throw new Error(`Position ${family.position} CAGED chord tones must stay inside every contour in that family.`);
        }
      }
    }
  }

  function preflightProject(candidate) {
    renderer.renderOverviewSvg(candidate.data, {
      focusMode: candidate.settings.overviewFocus,
      overlay: candidate.settings.overviewOverlay
    });
    for (const mode of candidate.data.modes) {
      renderer.renderModeSvg(candidate.data, mode, candidate.settings);
    }
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

  function populateOverviewFocusOptions() {
    overviewFocusControl.innerHTML = `<option value="all">All positions</option>`
      + project.data.modes.map((mode) => `<option value="${escapeHtml(mode.id)}">${escapeHtml(mode.name)}</option>`).join("");
  }

  function applyControls() {
    document.querySelector(`input[name="view"][value="${project.settings.view}"]`).checked = true;
    overlayControl.value = project.settings.overlay;
    fretSpacingControl.value = project.settings.fretSpacing;
    overviewFocusControl.value = project.settings.overviewFocus;
    overviewOverlayControl.value = project.settings.overviewOverlay;
    overviewOverlayControl.disabled = project.settings.overviewFocus === "all";
  }

  function renderLegend() {
    const markers = project.settings.view === "full"
      ? [{ kind: "filled", label: "Mode note" }]
      : project.settings.view === "pentatonic"
        ? [{ kind: "filled", label: "Pentatonic note" }]
        : [
          { kind: "filled", label: "Pentatonic core" },
          { kind: "hollow", label: "Modal color tone outside the core" }
        ];
    markers.push({ kind: "root", label: "Tonic" });

    const overlayLabels = {
      characteristic: "Selected characteristic tone(s)",
      triad: "Selected tonic-triad tones",
      seventh: "Selected tonic-seventh tones"
    };
    if (project.settings.overlay !== "none") {
      markers.push({ kind: "highlight", label: overlayLabels[project.settings.overlay] });
    }

    const explanation = project.settings.view === "full"
      ? "All seven mode notes are shown equally."
      : project.settings.view === "pentatonic"
        ? "Only the five-note pentatonic core is shown; an active highlight may name tones hidden from this view."
        : "Filled notes form the pentatonic core. Hollow notes are full-mode color tones, not lesser or avoid notes.";
    const overlayNotes = {
      none: "",
      characteristic: " Characteristic tones give the mode its clearest color; the thick amber edge does not change scale membership.",
      triad: " A tonic triad is built by taking every other mode degree from home: 1, 3 and 5. The actual ♭3 or ♭5 determines its chord quality.",
      seventh: " A tonic seventh chord extends the tonic triad by adding the mode's seventh degree: 1, 3, 5 and 7."
    };

    legendRoot.innerHTML = markers.map((marker) => `<span><i class="legend-marker ${marker.kind}" aria-hidden="true"></i>${marker.label}</span>`).join("")
      + `<p>${explanation}${overlayNotes[project.settings.overlay]}</p>`;
  }

  function renderOverview() {
    overviewOverlayControl.disabled = project.settings.overviewFocus === "all";
    overviewFrame.innerHTML = renderer.renderOverviewSvg(project.data, {
      focusMode: project.settings.overviewFocus,
      overlay: project.settings.overviewOverlay
    });
  }

  function renderTheoryReference() {
    const sortedFamilies = [...project.data.positionFamilies].sort((a, b) => a.position - b.position);
    cagedReference.innerHTML = sortedFamilies.map((family) => `<li><span>P${escapeHtml(family.position)}</span><strong>${escapeHtml(family.cagedForm)}-form</strong></li>`).join("");

    modeReferenceBody.innerHTML = project.data.modes.map((mode) => {
      const formula = mode.tones.map((tone) => renderer.prettyDegree(tone.degree)).join(" ");
      const identity = mode.characteristicDegrees.map(renderer.prettyDegree).join(" + ");
      const additions = mode.tones.filter((tone) => !tone.core).map((tone) => renderer.prettyDegree(tone.degree)).join(" + ");
      const coreName = mode.pentatonicNote ? "Project subset" : renderer.pentatonicDisplayName(mode);
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
    renderLegend();
    renderTheoryReference();
    diagramsRoot.innerHTML = project.data.modes.map((mode) => {
      const svg = renderer.renderModeSvg(project.data, mode, project.settings);
      const modeId = escapeHtml(mode.id);
      const modeTitle = mode.name;
      const accessibleModeTitle = `${mode.tonic} ${mode.name}`;
      return `<article class="diagram-card print-card" data-mode-id="${modeId}">
        <div class="diagram-heading">
          <div><h2>${escapeHtml(modeTitle)}</h2><p>Position ${escapeHtml(mode.position)} · root on string ${escapeHtml(mode.anchor.string)}, fret ${escapeHtml(mode.anchor.fret)}</p></div>
          <div class="diagram-actions">
            <button type="button" data-action="export" data-mode-id="${modeId}" aria-label="Export ${escapeHtml(accessibleModeTitle)} SVG">Export SVG</button>
            <button type="button" data-action="print" data-mode-id="${modeId}" aria-label="Print ${escapeHtml(accessibleModeTitle)} box">Print this box</button>
          </div>
        </div>
        <div class="svg-frame">${svg}</div>
      </article>`;
    }).join("");
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

  function exportSvg(modeId) {
    const mode = project.data.modes.find((candidate) => candidate.id === modeId);
    const markup = renderer.renderModeSvg(project.data, mode, project.settings);
    const filename = `${renderer.exportFileStem(mode, project.settings.view, project.settings.overlay, project.settings.fretSpacing)}.svg`;
    downloadBlob(`<?xml version="1.0" encoding="UTF-8"?>\n${markup}\n`, "image/svg+xml;charset=utf-8", filename);
    status.textContent = `Exported ${mode.name} as ${filename}.`;
  }

  function exportOverview() {
    const markup = renderer.renderOverviewSvg(project.data, {
      focusMode: project.settings.overviewFocus,
      overlay: project.settings.overviewOverlay
    });
    const filename = `${renderer.overviewFileStem(project.data, project.settings.overviewFocus)}.svg`;
    downloadBlob(`<?xml version="1.0" encoding="UTF-8"?>\n${markup}\n`, "image/svg+xml;charset=utf-8", filename);
    status.textContent = `Exported the connected-position overview as ${filename}.`;
  }

  function clearPrintTarget() {
    document.body.classList.remove("print-single");
    document.querySelectorAll(".is-print-target").forEach((element) => element.classList.remove("is-print-target"));
  }

  function printOne(modeId) {
    clearPrintTarget();
    document.body.classList.add("print-single");
    document.querySelector(`[data-mode-id="${modeId}"].diagram-card`).classList.add("is-print-target");
    window.print();
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

  overviewFocusControl.addEventListener("change", (event) => {
    project.settings.overviewFocus = event.target.value;
    saveProject();
    renderOverview();
  });

  overviewOverlayControl.addEventListener("change", (event) => {
    project.settings.overviewOverlay = event.target.value;
    saveProject();
    renderOverview();
  });

  document.getElementById("export-overview").addEventListener("click", exportOverview);
  document.getElementById("print-overview").addEventListener("click", printOverview);
  document.getElementById("print-cheat-sheet").addEventListener("click", () => {
    clearPrintTarget();
    window.print();
  });

  document.querySelectorAll('input[name="view"]').forEach((control) => {
    control.addEventListener("change", (event) => {
      project.settings.view = event.target.value;
      saveProject();
      render();
    });
  });

  overlayControl.addEventListener("change", (event) => {
    project.settings.overlay = event.target.value;
    saveProject();
    render();
  });

  fretSpacingControl.addEventListener("change", (event) => {
    project.settings.fretSpacing = event.target.value;
    saveProject();
    render();
  });

  diagramsRoot.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "export") exportSvg(button.dataset.modeId);
    if (button.dataset.action === "print") printOne(button.dataset.modeId);
  });

  document.getElementById("print-all").addEventListener("click", () => {
    clearPrintTarget();
    window.print();
  });

  document.getElementById("download-project").addEventListener("click", () => {
    downloadBlob(`${JSON.stringify(project, null, 2)}\n`, "application/json;charset=utf-8", "relative-mode-boxes.json");
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
      populateOverviewFocusOptions();
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
  populateOverviewFocusOptions();
  applyControls();
  render();
  activatePage(false);
}());
