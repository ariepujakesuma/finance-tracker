// Reads a PDF into text lines with pdf.js, entirely in the browser: the file never leaves the device.

type PdfJs = {
  getDocument: (src: { data: Uint8Array; password?: string }) => { promise: Promise<any> };
};

export class PdfPasswordError extends Error {
  wrong: boolean;
  constructor(wrong: boolean) {
    super(wrong ? 'Password PDF salah.' : 'PDF ini dikunci password.');
    this.wrong = wrong;
  }
}

/** Groups text items that share a baseline into lines, left to right. */
export async function pdfLines(pdfjs: PdfJs, data: Uint8Array, password?: string): Promise<string[]> {
  let doc: any;
  try {
    doc = await pdfjs.getDocument({ data, password: password || undefined }).promise;
  } catch (err: any) {
    if (err?.name === 'PasswordException') throw new PdfPasswordError(err.code === 2);
    throw new Error('File ini tidak bisa dibaca sebagai PDF.');
  }
  const lines: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const rows: { y: number; parts: { x: number; s: string }[] }[] = [];
    for (const it of content.items as any[]) {
      if (!('str' in it) || !it.str.trim()) continue;
      const x = it.transform[4];
      const y = it.transform[5];
      let row = rows.find((r) => Math.abs(r.y - y) < 2.5);
      if (!row) rows.push((row = { y, parts: [] }));
      row.parts.push({ x, s: it.str });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) lines.push(r.parts.sort((a, b) => a.x - b.x).map((q) => q.s.trim()).join(' '));
  }
  await doc.destroy();
  return lines;
}
