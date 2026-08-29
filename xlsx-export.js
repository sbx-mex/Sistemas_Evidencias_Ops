(function (root) {
  "use strict";

  const encoder = new TextEncoder();
  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
      table[index] = value >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let value = 0xffffffff;
    for (const byte of bytes) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
    return (value ^ 0xffffffff) >>> 0;
  }

  function xml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
    })[char]);
  }

  function columnName(index) {
    let value = index + 1;
    let name = "";
    while (value) { value -= 1; name = String.fromCharCode(65 + (value % 26)) + name; value = Math.floor(value / 26); }
    return name;
  }

  function cellXml(value, row, column, style) {
    if (value === null || value === undefined || value === "") return "";
    const address = `${columnName(column)}${row}`;
    if (typeof value === "object" && value.formula) {
      return `<c r="${address}" s="${value.style ?? style}"><f>${xml(value.formula)}</f><v>${Number(value.cached || 0)}</v></c>`;
    }
    const actual = typeof value === "object" && Object.hasOwn(value, "value") ? value.value : value;
    const actualStyle = typeof value === "object" && value.style !== undefined ? value.style : style;
    if (typeof actual === "number" && Number.isFinite(actual)) return `<c r="${address}" s="${actualStyle}"><v>${actual}</v></c>`;
    if (typeof actual === "boolean") return `<c r="${address}" s="${actualStyle}" t="b"><v>${actual ? 1 : 0}</v></c>`;
    return `<c r="${address}" s="${actualStyle}" t="inlineStr"><is><t xml:space="preserve">${xml(actual)}</t></is></c>`;
  }

  function sheetXml(sheet) {
    const headerRows = new Set(sheet.headerRows || []);
    const percentColumns = new Set(sheet.percentColumns || []);
    const countColumns = new Set(sheet.countColumns || []);
    const dataStartRow = Math.max(0, ...(sheet.headerRows || [])) + 1;
    const rows = sheet.rows.map((values, index) => {
      const rowNumber = index + 1;
      const baseStyle = rowNumber === 1 ? 1 : rowNumber === 2 ? 4 : headerRows.has(rowNumber) ? 2 : 0;
      const cells = values.map((value, column) => {
        let style = baseStyle;
        if (rowNumber >= dataStartRow && percentColumns.has(column + 1)) style = 3;
        else if (rowNumber >= dataStartRow && countColumns.has(column + 1)) style = 6;
        return cellXml(value, rowNumber, column, style);
      }).join("");
      const height = rowNumber === 1 ? 31 : rowNumber === 2 ? 24 : headerRows.has(rowNumber) ? 23 : 20;
      return `<row r="${rowNumber}" ht="${height}" customHeight="1">${cells}</row>`;
    }).join("");
    const columns = (sheet.widths || []).map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
    const merges = (sheet.merges || []).map((ref) => `<mergeCell ref="${xml(ref)}"/>`).join("");
    const freeze = sheet.freezeRow ? `<pane ySplit="${sheet.freezeRow}" topLeftCell="A${sheet.freezeRow + 1}" activePane="bottomLeft" state="frozen"/>` : "";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0">${freeze}</sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="20"/><cols>${columns}</cols><sheetData>${rows}</sheetData>
  ${sheet.autoFilter ? `<autoFilter ref="${xml(sheet.autoFilter)}"/>` : ""}
  ${merges ? `<mergeCells count="${sheet.merges.length}">${merges}</mergeCells>` : ""}
  <pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
</worksheet>`;
  }

  function dosDateTime(date = new Date()) {
    const year = Math.max(1980, date.getFullYear());
    return {
      time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
      date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    };
  }

  function write16(target, value) { target.push(value & 0xff, (value >>> 8) & 0xff); }
  function write32(target, value) { target.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff); }

  function zip(files) {
    const local = [];
    const central = [];
    let offset = 0;
    const stamp = dosDateTime();
    Object.entries(files).forEach(([name, content]) => {
      const nameBytes = encoder.encode(name);
      const data = typeof content === "string" ? encoder.encode(content) : content;
      const checksum = crc32(data);
      const header = [];
      write32(header, 0x04034b50); write16(header, 20); write16(header, 0x0800); write16(header, 0);
      write16(header, stamp.time); write16(header, stamp.date); write32(header, checksum); write32(header, data.length); write32(header, data.length);
      write16(header, nameBytes.length); write16(header, 0);
      local.push(new Uint8Array(header), nameBytes, data);

      const directory = [];
      write32(directory, 0x02014b50); write16(directory, 20); write16(directory, 20); write16(directory, 0x0800); write16(directory, 0);
      write16(directory, stamp.time); write16(directory, stamp.date); write32(directory, checksum); write32(directory, data.length); write32(directory, data.length);
      write16(directory, nameBytes.length); write16(directory, 0); write16(directory, 0); write16(directory, 0); write16(directory, 0); write32(directory, 0); write32(directory, offset);
      central.push(new Uint8Array(directory), nameBytes);
      offset += header.length + nameBytes.length + data.length;
    });
    const centralSize = central.reduce((sum, item) => sum + item.length, 0);
    const end = [];
    write32(end, 0x06054b50); write16(end, 0); write16(end, 0); write16(end, Object.keys(files).length); write16(end, Object.keys(files).length);
    write32(end, centralSize); write32(end, offset); write16(end, 0);
    const size = offset + centralSize + end.length;
    const output = new Uint8Array(size);
    let cursor = 0;
    [...local, ...central, new Uint8Array(end)].forEach((item) => { output.set(item, cursor); cursor += item.length; });
    return output;
  }

  function buildWorkbook(spec) {
    if (!spec?.sheets?.length) throw new Error("El libro requiere al menos una hoja.");
    const sheetEntries = spec.sheets.map((sheet, index) => `<sheet name="${xml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("");
    const sheetRelationships = spec.sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("");
    const sheetOverrides = spec.sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");
    const files = {
      "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheetOverrides}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
      "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
      "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${sheetEntries}</sheets><calcPr calcId="191029" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>`,
      "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetRelationships}<Relationship Id="rId${spec.sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
      "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="0.0%"/><numFmt numFmtId="165" formatCode="#,##0"/></numFmts><fonts count="5"><font><sz val="10"/><name val="Aptos"/><color rgb="FF17221E"/></font><font><b/><sz val="18"/><name val="Aptos Display"/><color rgb="FFFFFFFF"/></font><font><b/><sz val="10"/><name val="Aptos"/><color rgb="FFFFFFFF"/></font><font><i/><sz val="10"/><name val="Aptos"/><color rgb="FF43544C"/></font><font><b/><sz val="13"/><name val="Aptos Display"/><color rgb="FF006241"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF006241"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1E3932"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE9F4EF"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><bottom style="thin"><color rgb="FFDCE5E0"/></bottom></border></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="7"><xf fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/><xf fontId="1" fillId="1" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center"/></xf><xf fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center"/></xf><xf numFmtId="164" fontId="4" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1"><alignment horizontal="right"/></xf><xf fontId="3" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center"/></xf><xf fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1"/><xf numFmtId="165" fontId="4" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1"><alignment horizontal="right"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
      "docProps/core.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(spec.title || "Sistema de Evidencias OPS")}</dc:title><dc:creator>Centro Norte</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`,
      "docProps/app.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Sistema de Evidencias OPS</Application></Properties>`,
    };
    spec.sheets.forEach((sheet, index) => { files[`xl/worksheets/sheet${index + 1}.xml`] = sheetXml(sheet); });
    return zip(files);
  }

  function downloadWorkbook(spec, filename) {
    const bytes = buildWorkbook(spec);
    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
    return { url, blob, bytes };
  }

  root.OPSXlsx = { buildWorkbook, downloadWorkbook };
})(typeof window === "undefined" ? globalThis : window);
