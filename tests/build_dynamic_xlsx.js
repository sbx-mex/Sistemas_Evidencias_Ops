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
      rows: [["Sistema de Evidencias OPS", "", ""], ["Centro Norte", "", ""], [], ["DM", "% Avance", "Decisión"], ["Enrique Cesar", 0.014, { value: "Priorizar hoy", style: 11 }]],
      widths: [28, 16, 20], merges: ["A1:C1", "A2:C2"], headerRows: [4], percentColumns: [2], freezeRow: 4, autoFilter: "A4:C5", tabColor: "FF006241",
    },
    {
      name: "Tiendas",
      rows: [
        ["Detalle de actividades por tienda", "", "", "", "", "", "", "", "", "", ""],
        ["DM · Enrique Cesar Flores", "", "", "", "", "", "", "", "", "", ""],
        ["1 = Realizada · 0 = Pendiente", "", "", "", "", "", "", "", "", "", ""],
        ["CeCo", "Tienda", "Roll Out", "Rack FHW", "QR - Qualtrics", "Mandil Verde", "Realizadas", "Pendientes", "% Avance", "Estado", "Decisión"],
        ["38401", "Coacalco", { value: 1, style: 7 }, { value: "", style: 0 }, { value: 1, style: 7 }, { value: 0, style: 8 }, { formula: "SUM(C5:F5)", cached: 2, style: 6 }, { formula: "COUNT(C5:F5)-SUM(C5:F5)", cached: 1, style: 6 }, { formula: "IFERROR(SUM(C5:F5)/COUNT(C5:F5),0)", cached: 2 / 3, style: 3 }, { value: "Seguimiento", style: 10 }, { value: "Dar seguimiento", style: 10 }],
      ],
      widths: [13, 28, 18, 18, 22, 20, 14, 14, 14, 16, 20],
      merges: ["A1:K1", "A2:K2", "A3:K3"], headerRows: [4], percentColumns: [9], countColumns: [3, 4, 5, 6, 7, 8], freezeRow: 4, autoFilter: "A4:K5", tabColor: "FF004C3F",
    },
    {
      name: "Actividades",
      rows: [
        ["Avance por actividad", "", "", "", "", "", "", ""],
        ["Centro Norte", "", "", "", "", "", "", ""],
        [],
        ["Orden", "Actividad", "Realizadas", "Pendientes", "% Avance", "Fecha compromiso", "Estado", "Decisión"],
        [1, "Roll Out", 12, 60, 12 / 72, "03/09/26", { value: "Atención", style: 11 }, { value: "Priorizar hoy", style: 11 }],
      ],
      widths: [10, 40, 14, 14, 14, 20, 16, 20],
      merges: ["A1:H1", "A2:H2"], headerRows: [4], percentColumns: [5], countColumns: [1, 3, 4], freezeRow: 4, autoFilter: "A4:H5", tabColor: "FF16845B",
    },
  ],
});
fs.writeFileSync(output, Buffer.from(bytes));
console.log(`XLSX dinámico validado: ${bytes.length} bytes`);
