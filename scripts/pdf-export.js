// Minimal PDF writer: puts a canvas into a PDF as JPEG images.
// No external library is needed for this simple case.

const PX_TO_PT = 0.75;
// PDF pages cannot be larger than 14400 pt, so long screenshots are split into several pages.
const MAX_PAGE_PT = 14400;
const JPEG_QUALITY = 0.92;

const encoder = new TextEncoder();

async function canvasPartToJpeg(canvas, top, height) {
  const partCanvas = new OffscreenCanvas(canvas.width, height);
  const context = partCanvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, height);
  context.drawImage(canvas, 0, top, canvas.width, height, 0, 0, canvas.width, height);
  const blob = await partCanvas.convertToBlob({type: 'image/jpeg', quality: JPEG_QUALITY});
  return new Uint8Array(await blob.arrayBuffer());
}

function formatNumber(value) {
  return Number(value.toFixed(2)).toString();
}

export async function createPdfBlob(canvas) {
  const maxPartHeight = Math.floor(MAX_PAGE_PT / PX_TO_PT);
  const parts = [];

  for (let top = 0; top < canvas.height; top += maxPartHeight) {
    const height = Math.min(maxPartHeight, canvas.height - top);
    parts.push({height, jpeg: await canvasPartToJpeg(canvas, top, height)});
  }

  // Object numbers: 1 catalog, 2 pages, then 3 per page (page, image, content).
  const chunks = [];
  const offsets = [];
  let length = 0;

  function write(data) {
    const bytes = typeof data === 'string' ? encoder.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  }

  function startObject(number) {
    offsets[number] = length;
    write(`${number} 0 obj\n`);
  }

  const pageNumbers = parts.map((_, index) => 3 + index * 3);
  const objectCount = 2 + parts.length * 3;

  write('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  startObject(1);
  write('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  startObject(2);
  write(`<< /Type /Pages /Kids [${pageNumbers.map(number => `${number} 0 R`).join(' ')}] /Count ${parts.length} >>\nendobj\n`);

  parts.forEach((part, index) => {
    const pageNumber = pageNumbers[index];
    const imageNumber = pageNumber + 1;
    const contentNumber = pageNumber + 2;
    const pageWidth = formatNumber(canvas.width * PX_TO_PT);
    const pageHeight = formatNumber(part.height * PX_TO_PT);
    const content = `q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Im0 Do Q\n`;

    startObject(pageNumber);
    write(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}]`
      + ` /Resources << /XObject << /Im0 ${imageNumber} 0 R >> >> /Contents ${contentNumber} 0 R >>\nendobj\n`);

    startObject(imageNumber);
    write(`<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${part.height}`
      + ` /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${part.jpeg.length} >>\nstream\n`);
    write(part.jpeg);
    write('\nendstream\nendobj\n');

    startObject(contentNumber);
    write(`<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`);
  });

  const xrefOffset = length;
  write(`xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`);

  for (let number = 1; number <= objectCount; number += 1) {
    write(`${String(offsets[number]).padStart(10, '0')} 00000 n \n`);
  }

  write(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  return new Blob(chunks, {type: 'application/pdf'});
}
