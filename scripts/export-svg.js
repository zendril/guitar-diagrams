"use strict";

const fs = require("node:fs");
const path = require("node:path");
const data = require("../src/diagram-data.js");
const renderer = require("../src/render.js");

const root = path.resolve(__dirname, "..");
const targets = [
  { view: "full", directory: "full-scale" },
  { view: "combined", directory: "pentatonic-emphasis" },
  { view: "pentatonic", directory: "pentatonic" }
];

for (const target of targets) {
  const directory = path.join(root, "exports", target.directory);
  fs.mkdirSync(directory, { recursive: true });
  for (const mode of data.modes) {
    const markup = renderer.renderModeSvg(data, mode, { view: target.view });
    const filename = `${renderer.exportFileStem(mode, target.view)}.svg`;
    fs.writeFileSync(path.join(directory, filename), `<?xml version="1.0" encoding="UTF-8"?>\n${markup}\n`, "utf8");
  }
}

const overviewDirectory = path.join(root, "exports", "overview");
fs.mkdirSync(overviewDirectory, { recursive: true });
const overviewMarkup = renderer.renderOverviewSvg(data, { focusMode: "all", overlay: "none" });
fs.writeFileSync(
  path.join(overviewDirectory, `${renderer.overviewFileStem(data, "all")}.svg`),
  `<?xml version="1.0" encoding="UTF-8"?>\n${overviewMarkup}\n`,
  "utf8"
);

console.log("Exported 22 standalone SVG diagrams, including the connected-position overview.");
