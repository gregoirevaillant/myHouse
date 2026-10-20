import type { Category } from "./categories.js";

// Bruit habituel des libellés bancaires français : préfixes de type d'opération et références
const PREFIXES =
  /^(prlv sepa|prelevement sepa|prelevement|prlv|vir sepa inst|vir inst|vir sepa|virement sepa|virement recu|virement emis|virement|vir|paiement par carte|paiement cb|facture carte|carte|cb|retrait dab|retrait)\b/;
// les mois dans « SALAIRE MARS » changeraient la clé chaque mois
const MONTHS = new Set(["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre", "janv", "fevr", "avr", "juil", "sept", "oct", "nov", "dec"]);
const NOISE_MARKERS = / (ech|id emetteur|ref|mdt|lib|motif|date|de:|pour:|rum)\b.*$/;

// "PRLV SEPA NETFLIX.COM ECH/150324 ID EMETTEUR/FR12ZZZ" → "netflix.com"
export function normalizeLabel(label: string) {
  let s = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  for (let i = 0; i < 2; i++) s = s.replace(PREFIXES, "").trim();
  s = s.replace(NOISE_MARKERS, "");
  const words = s
    .split(/[\s/*]+/)
    .map((w) => w.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ""))
    .filter((w) => w && !/\d/.test(w) && !MONTHS.has(w));
  return words.slice(0, 4).join(" ") || label.toLowerCase().trim();
}

const INVESTMENT_WORDS = /\b(assurance vie|pea|pea pme|compte titres|bourse|boursorama banque titres|trade republic|degiro|binance|coinbase|yomoni|linxea|nalo)\b/;
const SAVINGS_WORDS = /\b(livret|livret a|ldds|lddd|lep|pel|cel|epargne)\b/;

const KEYWORDS: [RegExp, Category][] = [
  [/\b(salaire|paie|remuneration|traitement)\b/, "SALARY"],
  [/\b(caf|pole emploi|france travail)\b/, "OTHER_INCOME"],
  [INVESTMENT_WORDS, "INVESTMENT"],
  [SAVINGS_WORDS, "SAVINGS"],
  [/\b(dgfip|impot|impots|tresor public|taxe)\b/, "TAXES"],
  [/\b(loyer|foncia|nexity|syndic|credit immobilier|pret immo|echeance pret|habitation)\b/, "HOUSING"],
  [/\b(netflix|spotify|deezer|disney|canal|amazon prime|prime video|apple com|itunes|google|youtube|icloud|adobe|microsoft|openai|anthropic|claude|chatgpt|dropbox|basic fit|fitness park|salle de sport)\b/, "SUBSCRIPTIONS"],
  [/\b(edf|engie|total energies|totalenergies energie|eau|veolia|suez|free|freebox|free mobile|orange|sosh|sfr|red by sfr|bouygues|b and you)\b/, "UTILITIES"],
  [/\b(sncf|ratp|navigo|uber|bolt|blablacar|total|esso|shell|bp|avia|intermarche carburant|peage|vinci autoroutes|sanef|aprr|parking|indigo|air france|easyjet|ryanair|transavia)\b/, "TRANSPORT"],
  [/\b(carrefour|leclerc|e leclerc|lidl|aldi|auchan|monoprix|franprix|intermarche|super u|hyper u|casino|picard|biocoop|naturalia|grand frais|netto|cora|match|boulangerie)\b/, "GROCERIES"],
  [/\b(pharmacie|doctolib|medecin|dentiste|kine|mutuelle|alan|harmonie|mgen|hopital|clinique|laboratoire|opticien|cpam|ameli)\b/, "HEALTH"],
  [/\b(restaurant|resto|mcdonald|mc donald|burger king|kfc|uber eats|deliveroo|just eat|starbucks|cafe|bar|cinema|ugc|pathe|fnac spectacles|ticketmaster|airbnb|booking|hotel)\b/, "LEISURE"],
  [/\b(amazon|fnac|darty|decathlon|ikea|leroy merlin|castorama|zara|h m|uniqlo|kiabi|sephora|action|cdiscount|vinted|apple store)\b/, "SHOPPING"],
];

// codes MCC des paiements carte (quand la banque les fournit)
const MCC: [number, number, Category][] = [
  [5411, 5499, "GROCERIES"],
  [5811, 5814, "LEISURE"],
  [7832, 7999, "LEISURE"],
  [7011, 7012, "LEISURE"],
  [4111, 4131, "TRANSPORT"],
  [4511, 4511, "TRANSPORT"],
  [4784, 4789, "TRANSPORT"],
  [5541, 5542, "TRANSPORT"],
  [7523, 7523, "TRANSPORT"],
  [3000, 3299, "TRANSPORT"],
  [5912, 5912, "HEALTH"],
  [8011, 8099, "HEALTH"],
  [4812, 4816, "UTILITIES"],
  [4899, 4900, "UTILITIES"],
  [9311, 9311, "TAXES"],
  [5200, 5399, "SHOPPING"],
  [5600, 5699, "SHOPPING"],
  [5700, 5999, "SHOPPING"],
];

export type TxToCategorize = {
  labelKey: string;
  label: string;
  amountCents: number;
  counterparty: string | null;
  counterpartyIban: string | null;
  mcc: string | null;
};
export type Rule = { pattern: string; category: string };
export type MyAccount = { iban: string | null; accountType: string | null; name: string };

// Un crédit venant d'une enseigne (carte, avoir, société) est un remboursement, pas un revenu
const REFUND_MARKERS = /^(carte|cb|paiement|avoir|remboursement|rembt|rbt|refund)\b|\b(avoir|remboursement|rembt|refund|retour)\b/;
const COMPANY_MARKERS = /\b(sa|sas|sasu|sarl|eurl|snc|ltd|limited|gmbh|ag|ab|nv|bv|srl|spa|inc|llc|bank|payments?|paypal|klarna|stripe|adyen|alma|com|fr|www)\b/;

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// livret, PEA… : reconnus au type du compte ou, à défaut, à son nom (certaines banques les déclarent en compte courant)
function savingsCategory(account: MyAccount): Category | null {
  const name = plain(account.name);
  if (INVESTMENT_WORDS.test(name)) return "INVESTMENT";
  if (SAVINGS_WORDS.test(name) || account.accountType === "SVGS") return "SAVINGS";
  return null;
}

// Ordre : règles apprises > virement interne > mots-clés > code MCC > défaut selon le sens
export function categorize(
  tx: TxToCategorize,
  rules: Rule[],
  myAccounts: MyAccount[],
  from: MyAccount,
): { category: string; source: "RULE" | "AUTO" } {
  // la règle la plus précise (motif le plus long) l'emporte
  const rule = rules.filter((r) => tx.labelKey.includes(r.pattern)).sort((a, b) => b.pattern.length - a.pattern.length)[0];
  if (rule) return { category: rule.category, source: "RULE" };

  const other = tx.counterpartyIban && myAccounts.find((a) => a.iban && sameIban(a.iban, tx.counterpartyIban!));
  if (other) {
    // vers un compte d'épargne à moi = épargne ; le reste (y compris l'arrivée sur le livret) = simple mouvement interne
    const savings = tx.amountCents < 0 && !savingsCategory(from) ? savingsCategory(other) : null;
    return { category: savings ?? "TRANSFER", source: "AUTO" };
  }

  const text = `${tx.labelKey} ${plain(tx.counterparty ?? "")} ${plain(tx.label)}`;
  const keyword = KEYWORDS.find(([re]) => re.test(text))?.[1];
  // un crédit chez un commerçant reste dans sa catégorie : c'est un remboursement qui diminue la dépense
  if (keyword) return { category: keyword, source: "AUTO" };

  const mcc = Number(tx.mcc);
  if (mcc) {
    const match = MCC.find(([min, max]) => mcc >= min && mcc <= max);
    if (match) return { category: match[2], source: "AUTO" };
  }

  if (tx.amountCents < 0) return { category: "OTHER", source: "AUTO" };
  // crédit non reconnu : revenu seulement s'il ne vient pas visiblement d'une enseigne (sinon il réduit les dépenses)
  const fromMerchant = REFUND_MARKERS.test(plain(tx.label)) || COMPANY_MARKERS.test(text);
  return { category: fromMerchant ? "OTHER" : "OTHER_INCOME", source: "AUTO" };
}

const sameIban = (a: string, b: string) => a.replace(/\s/g, "").toUpperCase() === b.replace(/\s/g, "").toUpperCase();
