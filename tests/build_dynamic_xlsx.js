#!/usr/bin/env node
const fs = require("node:fs");

require("../xlsx-export.js");

const output = process.argv[2];
if (!output) throw new Error("Indica la ruta de salida XLSX.");
const bytes = global.OPSXlsx.buildWorkbook({
  title: "Validación OPS",
  sheets: [{
    name: "Resumen",
    rows: [["Sistema de Evidencias OPS", ""], ["Centro Norte", ""], [], ["DM", "% Avance"], ["Enrique Cesar", 0.014]],
    widths: [28, 16], merges: ["A1:B1", "A2:B2"], headerRows: [4], percentColumns: [2], freezeRow: 4, autoFilter: "A4:B5",
  }],
});
fs.writeFileSync(output, Buffer.from(bytes));
console.log(`XLSX dinámico validado: ${bytes.length} bytes`);
