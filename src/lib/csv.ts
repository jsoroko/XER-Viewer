const escape = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function toCsv(fields: string[], rows: Iterable<string[]>): string {
  const lines = [fields.map(escape).join(",")];
  for (const r of rows) lines.push(r.map(escape).join(","));
  return lines.join("\r\n");
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(filename: string, text: string, mime = "text/csv") {
  // BOM so Excel opens UTF-8 correctly.
  downloadBlob(filename, new Blob(["\uFEFF", text], { type: `${mime};charset=utf-8` }));
}
