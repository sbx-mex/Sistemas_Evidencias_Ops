#!/usr/bin/env node
const fs = require("node:fs");

require("../xlsx-export.js");

const output = process.argv[2];
if (!output) throw new Error("Indica la ruta de salida XLSX.");
const bytes = global.OPSXlsx.buildWorkbook({
  title: "Validación OPS",
  sheets: [
    {
      name: "Resumen",
      rows: [["Sistema de Evidencias OPS", ""], ["Centro Norte", ""], [], ["DM", "% Avance"], ["Enrique Cesar", 0.014]],
      widths: [28, 16], merges: ["A1:B1", "A2:B2"], headerRows: [4], percentColumns: [2], freezeRow: 4, autoFilter: "A4:B5",
    },
    {
      name: "Tiendas",
      rows: [
        ["Detalle de actividades por tienda", "", "", "", "", "", "", "", ""],
        ["DM · Enrique Cesar Flores", "", "", "", "", "", "", "", ""],
        ["1 = Realizada · 0 = Pendiente", "", "", "", "", "", "", "", ""],
        ["CeCo", "Tienda", "Roll Out", "Rack FHW", "QR - Qualtrics", "Mandil Verde", "Realizadas", "Total", "% Avance"],
        ["38401", "Coacalco", { value: 1, style: 7 }, { value: 0, style: 8 }, { value: 1, style: 7 }, { value: 0, style: 8 }, { formula: "SUM(C5:F5)", cached: 2, style: 6 }, { formula: "COUNT(C5:F5)", cached: 4, style: 6 }, { formula: "IFERROR(G5/H5,0)", cached: 0.5, style: 3 }],
      ],
      widths: [13, 28, 18, 18, 22, 20, 14, 12, 14],
      merges: ["A1:I1", "A2:I2", "A3:I3"], headerRows: [4], percentColumns: [9], countColumns: [3, 4, 5, 6, 7, 8], freezeRow: 4, autoFilter: "A4:I5",
    },
  ],
});
fs.writeFileSync(output, Buffer.from(bytes));
console.log(`XLSX dinámico validado: ${bytes.length} bytes`);
