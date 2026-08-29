#!/usr/bin/env node
const fs = require("node:fs");

require("../pdf-export.js");

const output = process.argv[2];
if (!output) throw new Error("Indica la ruta de salida PDF.");
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const bytes = global.OPSPdf.buildPdf([{ bytes: jpeg, width: 1, height: 1 }]);
fs.writeFileSync(output, Buffer.from(bytes));
console.log(`PDF directo validado: ${bytes.length} bytes`);
