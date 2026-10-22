import type { ExpenseInput, Member } from "./api";

// Import des fichiers de tricount-exporter.pages.dev :
// - classeur Excel (.xlsx) : feuille 1 = dépenses et rentrées, feuille 2 = remboursements, en-têtes traduits
// - JSON / CSV d'une table (Dépenses ou Remboursements) : clés en anglais
// Montants signés comme dans Tricount : les rentrées (argent reçu pour le groupe) sont négatives.

export type EntryType = "expense" | "income" | "reimbursement";
export type TricountEntry = {
  date: string; // YYYY-MM-DD
  type: EntryType;
  title: string;
  payer: string;
  shares: Record<string, number>; // centimes signés par personne
};
export type TricountFile = { name: string; entries: TricountEntry[]; currency: string | null };

// --- lecture ---------------------------------------------------------------------------

export async function readTricountFile(file: File): Promise<TricountFile> {
  const name = file.name.replace(/\.(xlsx|json|csv)$/i, "").replace(/_(expenses|reimbursements)$/i, "");
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "xlsx") return { name, ...(await readXlsx(new Uint8Array(await file.arrayBuffer()))) };
  const text = (await file.text()).replace(/^\uFEFF/, "");
  if (ext === "json" || text.trimStart().startsWith("[")) return { name, entries: fromJson(text), currency: null };
  return { name, entries: fromCsv(text), currency: null };
}

const toCents = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

function asType(raw: unknown, totalCents: number): EntryType {
  const t = String(raw ?? "").toLowerCase();
  if (t === "expense" || t === "income" || t === "reimbursement") return t;
  return totalCents < 0 ? "income" : "expense";
}

// les cellules de texte commençant par = + - @ sont précédées d'une apostrophe (protection des tableurs)
const unprotect = (s: string) => s.replace(/^'(?=[=+\-@])/, "");

function entry(date: string, type: EntryType, title: string, payer: string, shares: Record<string, number>): TricountEntry {
  return { date, type, title: unprotect(title.trim()) || "Dépense Tricount", payer: payer.trim(), shares };
}

function fromJson(text: string): TricountEntry[] {
  const rows = JSON.parse(text);
  if (!Array.isArray(rows)) throw new Error("Ce fichier JSON ne vient pas de Tricount Exporter");
  return rows.map((r) => {
    const shares: Record<string, number> = {};
    for (const [who, v] of Object.entries((r.shares ?? {}) as Record<string, unknown>)) shares[who] = toCents(v);
    const total = toCents(r.total);
    return entry(String(r.date ?? ""), asType(r.type, total), String(r.description ?? ""), String(r.paid_by ?? ""), shares);
  });
}

// CSV standard : virgules, champs entre guillemets possibles
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const endCell = () => {
    row.push(cell);
    cell = "";
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") endCell();
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endCell();
      rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell || row.length) {
    endCell();
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const FIXED = ["date", "type", "description", "category", "paid_by", "total"];

function fromCsv(text: string): TricountEntry[] {
  const [header, ...rows] = parseCsv(text);
  if (!header?.includes("paid_by")) throw new Error("Ce CSV ne vient pas de Tricount Exporter");
  const col = (row: string[], key: string) => row[header.indexOf(key)] ?? "";
  const people = header.filter((h) => !FIXED.includes(h));
  return rows.map((row) => {
    const shares: Record<string, number> = {};
    for (const p of people) {
      const v = row[header.indexOf(p)];
      if (v?.trim()) shares[p] = toCents(v);
    }
    return entry(col(row, "date"), asType(col(row, "type"), toCents(col(row, "total"))), col(row, "description"), col(row, "paid_by"), shares);
  });
}

// --- classeur Excel : zip lu à la main (stocké ou deflate), XML lu par expressions régulières ---

async function unzip(bytes: Uint8Array): Promise<Map<string, string>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = bytes.length - 22;
  while (eocd >= 0 && view.getUint32(eocd, true) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("Classeur Excel illisible");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const files = new Map<string, string>();
  const utf8 = new TextDecoder();
  for (let i = 0; i < count; i++) {
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = utf8.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!/\.xml$/.test(name)) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + size);
    if (method === 0) files.set(name, utf8.decode(raw));
    else if (method === 8) {
      const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      files.set(name, await new Response(stream).text());
    }
  }
  return files;
}

const xmlText = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

// lignes d'une feuille : { colonne: valeur } ; nombres en number, textes en string
function sheetRows(xml: string, shared: string[]): Record<string, string | number>[] {
  const rows: Record<string, string | number>[] = [];
  for (const [, body] of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: Record<string, string | number> = {};
    for (const [, attrs, inner = ""] of body.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /r="([A-Z]+)/.exec(attrs)?.[1];
      if (!ref) continue;
      const t = /t="(\w+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      if (t === "inlineStr") row[ref] = xmlText(inner);
      else if (t === "s") row[ref] = shared[Number(v)] ?? "";
      else if (t === "str") row[ref] = xmlText(v ?? "");
      else if (v != null) row[ref] = Number(v);
    }
    rows.push(row);
  }
  return rows;
}

// en-têtes traduits (fr, en, es, pt, it, de)
const DATE = /^(date|data|fecha|datum)$/i;
const DESC = /^(description|descri[çc][ãa]o|descripci[óo]n|descrizione|beschreibung)$/i;
const PAYER = /^(pay[ée] par|paid by|pagado por|pago por|pagato da|bezahlt von)$/i;
const TOTAL = /^(total|totale|gesamt|summe)\b/i;
const CURRENCY = /\s*\(([A-Z]{3})\)$/;

const excelDate = (v: string | number) =>
  typeof v === "number" ? new Date(Date.UTC(1899, 11, 30) + v * 86_400_000).toISOString().slice(0, 10) : String(v).slice(0, 10);

async function readXlsx(bytes: Uint8Array): Promise<{ entries: TricountEntry[]; currency: string | null }> {
  const files = await unzip(bytes);
  const shared = [...(files.get("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map(([, s]) => xmlText(s));
  const entries: TricountEntry[] = [];
  let currency: string | null = null;
  // feuille 1 : dépenses et rentrées ; feuille 2 : remboursements (récapitulatif et règlements ignorés)
  for (const [n, isReimbursement] of [[1, false], [2, true]] as const) {
    const xml = files.get(`xl/worksheets/sheet${n}.xml`);
    if (!xml) continue;
    const [head, ...rows] = sheetRows(xml, shared);
    if (!head) continue;
    const cols = Object.entries(head).map(([c, h]) => [c, String(h).trim()] as const);
    const find = (re: RegExp) => cols.find(([, h]) => re.test(h.replace(CURRENCY, "")))?.[0];
    const [dateCol, descCol, payerCol, totalCol] = [find(DATE), find(DESC), find(PAYER), find(TOTAL)];
    if (!dateCol || !payerCol) throw new Error("Garde toutes les colonnes dans l'export de Tricount Exporter");
    // colonnes des personnes : montant en devise, hors total
    const people = cols.filter(([c, h]) => CURRENCY.test(h) && c !== totalCol);
    currency ??= people.map(([, h]) => CURRENCY.exec(h)?.[1]).find(Boolean) ?? null;
    for (const row of rows) {
      if (row[dateCol] == null || row[payerCol] == null) continue;
      const shares: Record<string, number> = {};
      for (const [c, h] of people) if (typeof row[c] === "number") shares[h.replace(CURRENCY, "")] = toCents(row[c]);
      const total = totalCol ? toCents(row[totalCol]) : Object.values(shares).reduce((s, v) => s + v, 0);
      const type: EntryType = isReimbursement ? "reimbursement" : total < 0 ? "income" : "expense";
      entries.push(entry(excelDate(row[dateCol]), type, String(descCol ? row[descCol] ?? "" : ""), String(row[payerCol]), shares));
    }
  }
  return { entries, currency };
}

// --- conversion en dépenses du foyer -------------------------------------------------------

export const tricountPeople = (entries: TricountEntry[]) =>
  [...new Set(entries.flatMap((e) => [e.payer, ...Object.keys(e.shares)]))].filter(Boolean).sort((a, b) => a.localeCompare(b, "fr"));

const simplify = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// « Greg » ↔ « Grégoire », « Marie » ↔ « Marie D. » : même prénom ou début commun
export function guessMember(person: string, members: Member[]): string | null {
  const p = simplify(person);
  const first = (s: string) => s.split(/\s+/)[0];
  const hit = members.find((m) => {
    const n = simplify(m.name);
    return n === p || first(n) === first(p) || (p.length >= 3 && n.startsWith(p)) || (n.length >= 3 && p.startsWith(n));
  });
  return hit?.id ?? null;
}

export type Conversion = { expenses: Omit<ExpenseInput, "trackerId">[]; skipped: number };

// mapping : personne Tricount → id d'un membre, ou null (ignorée : ses parts sortent du compte entre nous deux)
export function toExpenses(entries: TricountEntry[], mapping: Record<string, string | null>): Conversion {
  const expenses: Conversion["expenses"] = [];
  let skipped = 0;
  for (const e of entries) {
    const payer = mapping[e.payer];
    const owed = new Map<string, number>();
    for (const [who, cents] of Object.entries(e.shares)) {
      const id = mapping[who];
      if (id) owed.set(id, (owed.get(id) ?? 0) + Math.abs(cents));
    }
    if (!payer || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) {
      skipped++;
      continue;
    }
    const title = e.title.slice(0, 200);
    if (e.type === "expense") {
      const shares = [...owed].filter(([, c]) => c > 0).map(([userId, amountCents]) => ({ userId, amountCents }));
      const amountCents = shares.reduce((s, x) => s + x.amountCents, 0);
      if (amountCents > 0) expenses.push({ title, amountCents, paidById: payer, date: e.date, isReimbursement: false, shares });
      else skipped++;
      continue;
    }
    // remboursement : le payeur rembourse les autres ; rentrée : le payeur a reçu l'argent des autres,
    // il leur doit leur part → enregistré comme un remboursement des autres vers lui
    owed.delete(payer);
    const others = [...owed].filter(([, c]) => c > 0);
    if (!others.length) {
      skipped++;
      continue;
    }
    for (const [other, amountCents] of others) {
      expenses.push(
        e.type === "reimbursement"
          ? { title, amountCents, paidById: payer, date: e.date, isReimbursement: true, shares: [{ userId: other, amountCents }] }
          : { title: `Rentrée : ${title}`.slice(0, 200), amountCents, paidById: other, date: e.date, isReimbursement: true, shares: [{ userId: payer, amountCents }] },
      );
    }
  }
  return { expenses, skipped };
}
