/** Embed a re-encoded JPEG as a single PDF page without external viewers or EXIF data. */
export function photoPdf(
  jpeg: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 1 ||
    height < 1 ||
    jpeg[0] !== 255 ||
    jpeg[1] !== 216
  )
    throw new Error("Fotoğraf PDF'e dönüştürülemedi.");
  const encode = (s: string) => new TextEncoder().encode(s),
    chunks: Uint8Array[] = [],
    offsets: number[] = [];
  let offset = 0;
  const put = (bytes: Uint8Array) => {
    chunks.push(bytes);
    offset += bytes.length;
  };
  const scale = Math.min(595 / width, 12000 / height),
    w = Number((width * scale).toFixed(2)),
    h = Number((height * scale).toFixed(2));
  put(encode("%PDF-1.4\n"));
  const object = (n: number, body: string | Uint8Array[]) => {
    offsets.push(offset);
    put(encode(`${n} 0 obj\n`));
    if (typeof body === "string") put(encode(body));
    else body.forEach(put);
    put(encode("\nendobj\n"));
  };
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Photo 4 0 R >> >> /Contents 5 0 R >>`,
  );
  object(4, [
    encode(
      `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
    ),
    jpeg,
    encode("\nendstream"),
  ]);
  const content = `q ${w} 0 0 ${h} 0 0 cm /Photo Do Q\n`;
  object(
    5,
    `<< /Length ${encode(content).length} >>\nstream\n${content}endstream`,
  );
  const xref = offset;
  put(
    encode(
      "xref\n0 6\n0000000000 65535 f \n" +
        offsets
          .map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)
          .join("") +
        `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
    ),
  );
  const result = new Uint8Array(offset);
  let at = 0;
  for (const chunk of chunks) {
    result.set(chunk, at);
    at += chunk.length;
  }
  return result;
}
