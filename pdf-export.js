(function (root) {
  "use strict";

  const encoder = new TextEncoder();

  function ascii(value) {
    return encoder.encode(value);
  }

  function join(chunks) {
    const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const output = new Uint8Array(size);
    let offset = 0;
    chunks.forEach((chunk) => { output.set(chunk, offset); offset += chunk.length; });
    return output;
  }

  function buildPdf(images, pageWidth = 841.89, pageHeight = 595.28) {
    if (!images?.length) throw new Error("El PDF requiere al menos una página.");
    const objectCount = 2 + images.length * 3;
    const objects = new Array(objectCount + 1);
    const pageRefs = [];

    objects[1] = [ascii("<< /Type /Catalog /Pages 2 0 R >>")];
    images.forEach((image, index) => {
      const imageObject = 3 + index * 3;
      const contentObject = imageObject + 1;
      const pageObject = imageObject + 2;
      const command = `q ${pageWidth.toFixed(2)} 0 0 ${pageHeight.toFixed(2)} 0 0 cm /Im0 Do Q`;
      pageRefs.push(`${pageObject} 0 R`);
      objects[imageObject] = [
        ascii(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`),
        image.bytes,
        ascii("\nendstream"),
      ];
      objects[contentObject] = [ascii(`<< /Length ${command.length} >>\nstream\n${command}\nendstream`)];
      objects[pageObject] = [ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)}] /Resources << /XObject << /Im0 ${imageObject} 0 R >> >> /Contents ${contentObject} 0 R >>`)];
    });
    objects[2] = [ascii(`<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${images.length} >>`)];

    const chunks = [ascii("%PDF-1.4\n%OPS\n")];
    const offsets = new Array(objectCount + 1).fill(0);
    let cursor = chunks[0].length;
    for (let id = 1; id <= objectCount; id += 1) {
      const block = [ascii(`${id} 0 obj\n`), ...objects[id], ascii("\nendobj\n")];
      offsets[id] = cursor;
      block.forEach((chunk) => { chunks.push(chunk); cursor += chunk.length; });
    }
    const xrefOffset = cursor;
    chunks.push(ascii(`xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`));
    for (let id = 1; id <= objectCount; id += 1) chunks.push(ascii(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`));
    chunks.push(ascii(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`));
    return join(chunks);
  }

  function canvasToJpeg(canvas, quality = 0.92) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(async (blob) => {
        if (!blob) { reject(new Error("No fue posible preparar la página del PDF.")); return; }
        resolve({ bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height });
      }, "image/jpeg", quality);
    });
  }

  async function downloadCanvases(canvases, filename) {
    const images = await Promise.all(canvases.map((canvas) => canvasToJpeg(canvas)));
    const bytes = buildPdf(images);
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    return { url, blob, bytes };
  }

  root.OPSPdf = { buildPdf, canvasToJpeg, downloadCanvases };
})(typeof window === "undefined" ? globalThis : window);
