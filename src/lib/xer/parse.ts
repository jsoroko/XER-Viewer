/**
 * Low-level XER parser.
 *
 * An XER file is a tab-delimited text export from Primavera P6:
 *
 *   ERMHDR <TAB> version <TAB> date <TAB> type <TAB> user <TAB> db <TAB> module <TAB> currency
 *   %T <TAB> TABLE_NAME
 *   %F <TAB> field_1 <TAB> field_2 ...
 *   %R <TAB> value_1 <TAB> value_2 ...
 *   %E
 */

export interface XerHeader {
  version: string;
  exportDate: string;
  exportType: string;
  user: string;
  database: string;
  module: string;
  currency: string;
}

export interface XerTable {
  name: string;
  fields: string[];
  rows: string[][];
}

export interface XerFile {
  header: XerHeader;
  tables: Map<string, XerTable>;
  warnings: string[];
}

export class XerParseError extends Error {
  override name = "XerParseError";
}

const MAX_WARNINGS = 25;

export function parseXer(input: string): XerFile {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const tables = new Map<string, XerTable>();
  const warnings: string[] = [];
  const warn = (message: string) => {
    if (warnings.length < MAX_WARNINGS) warnings.push(message);
  };

  let header: XerHeader | null = null;
  let current: XerTable | null = null;
  let lineNo = 0;
  let pos = 0;

  while (pos < text.length) {
    let nl = text.indexOf("\n", pos);
    if (nl === -1) nl = text.length;
    const end = nl > pos && text.charCodeAt(nl - 1) === 13 ? nl - 1 : nl;
    const line = text.slice(pos, end);
    pos = nl + 1;
    lineNo++;
    if (line === "") continue;

    if (header === null) {
      if (!line.startsWith("ERMHDR")) {
        throw new XerParseError(
          "This doesn't look like an XER file: the first line should start with ERMHDR.",
        );
      }
      const p = line.split("\t");
      header = {
        version: p[1] ?? "",
        exportDate: p[2] ?? "",
        exportType: p[3] ?? "",
        user: p[4] ?? "",
        database: p[5] ?? "",
        module: p[6] ?? "",
        currency: p[7] ?? "",
      };
      continue;
    }

    if (line.charCodeAt(0) !== 37 /* % */) {
      warn(`Line ${lineNo}: unexpected content outside a record, skipped.`);
      continue;
    }

    const tag = line.slice(0, 2);
    if (tag === "%T") {
      const name = line.slice(3).trim();
      if (tables.has(name)) warn(`Table ${name} appears more than once; the later copy replaces the earlier one.`);
      current = { name, fields: [], rows: [] };
      tables.set(name, current);
    } else if (tag === "%F") {
      if (!current) {
        warn(`Line ${lineNo}: field list without a table, skipped.`);
        continue;
      }
      current.fields = line.split("\t").slice(1);
    } else if (tag === "%R") {
      if (!current) {
        warn(`Line ${lineNo}: row without a table, skipped.`);
        continue;
      }
      const row = line.split("\t").slice(1);
      // Rows occasionally omit trailing empty values.
      while (row.length < current.fields.length) row.push("");
      current.rows.push(row);
    } else if (tag === "%E") {
      current = null;
    } else {
      warn(`Line ${lineNo}: unknown record type ${tag}, skipped.`);
    }
  }

  if (header === null) throw new XerParseError("The file is empty.");
  return { header, tables, warnings };
}

/** Decode raw bytes: XER files are UTF-8 or (very commonly) Windows-1252. */
export function decodeXer(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

/** Column-name based accessor over a table's positional rows. */
export interface TableReader {
  rows: string[][];
  get(row: string[], field: string): string;
}

const EMPTY_READER: TableReader = { rows: [], get: () => "" };

export function reader(table: XerTable | undefined): TableReader {
  if (!table) return EMPTY_READER;
  const index = new Map(table.fields.map((f, i) => [f, i]));
  return {
    rows: table.rows,
    get(row, field) {
      const i = index.get(field);
      return i === undefined ? "" : (row[i] ?? "");
    },
  };
}
