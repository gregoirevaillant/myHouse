import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type WeightEntry } from "./api";

// 72400 g → « 72,4 »
export const formatKg = (grams: number) => (grams / 1000).toFixed(1).replace(".", ",");

// saisie « 72,4 » ou « 72.4 » → grammes (NaN si illisible)
export const parseKg = (text: string) => Math.round(Number(text.replace(",", ".")) * 1000);

// pesées d'une plage de jours (YYYY-MM-DD, bornes incluses), de la plus ancienne à la plus récente
export const useWeights = (from: string, to: string) =>
  useQuery({ queryKey: ["weight", from, to], queryFn: () => api<WeightEntry[]>(`/weight?from=${from}&to=${to}`) });

// la synchronisation Garmin est proposée seulement si le serveur a une clé
export const useWeightStatus = () => useQuery({ queryKey: ["weight", "status"], queryFn: () => api<{ garmin: boolean }>("/weight/status") });

export function useGarminSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ imported: number }>("/weight/sync", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["weight"] }),
  });
}

// moyenne glissante sur 7 jours (la pesée et les 6 jours qui précèdent) : gomme l'eau et les repas, montre la vraie direction
export function smooth(points: { date: string; grams: number }[]) {
  return points.map((p) => {
    const t = Date.parse(p.date);
    const win = points.filter((q) => Date.parse(q.date) <= t && t - Date.parse(q.date) < 7 * 86400000);
    return { date: p.date, grams: win.reduce((s, q) => s + q.grams, 0) / win.length };
  });
}

// rythme en grammes par semaine (droite des moindres carrés) ; null s'il y a trop peu de pesées ou de recul
export function weeklyRate(points: { date: string; grams: number }[]) {
  if (points.length < 4) return null;
  const t0 = Date.parse(points[0].date);
  const xs = points.map((p) => (Date.parse(p.date) - t0) / 86400000);
  if (xs[xs.length - 1] < 14) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = points.reduce((a, p) => a + p.grams, 0) / points.length;
  const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  return den === 0 ? null : (xs.reduce((a, x, i) => a + (x - mx) * (points[i].grams - my), 0) / den) * 7;
}

// ── Analyse : que s'est-il passé entre le début et la fin de la période ? ──

// en dessous, la variation se confond avec le bruit de la balance (eau, repas, heure de la pesée)
const NOISE = 300;

export type Verdict = { tone: "good" | "neutral" | "bad"; icon: string; title: string; text: string };
export type Analysis = {
  weight: number; // variation en grammes
  muscle: number | null;
  fat: number | null; // masse grasse en grammes (poids × % de gras)
  other: number | null; // eau, os, organes : le reste
  verdict: Verdict | null;
};

// moyenne des 3 premières / dernières valeurs : une seule pesée "chargée en eau" ne fausse pas le résultat
const edge = (values: number[], end: "start" | "end") => {
  const part = end === "start" ? values.slice(0, 3) : values.slice(-3);
  return part.reduce((a, b) => a + b, 0) / part.length;
};

const kg = (g: number) => formatKg(Math.abs(g));
const pct = (n: number) => `${Math.round(n * 100)} %`;

export function analyse(entries: WeightEntry[]): Analysis | null {
  if (entries.length < 4) return null;
  const days = (Date.parse(entries[entries.length - 1].date) - Date.parse(entries[0].date)) / 86400000;
  if (days < 7) return null;

  const weights = entries.map((e) => e.grams);
  const weight = edge(weights, "end") - edge(weights, "start");
  const withMuscle = entries.filter((e) => e.muscleGrams !== null);
  const withFat = entries.filter((e) => e.bodyFat !== null);
  const muscle = withMuscle.length >= 4 ? edge(withMuscle.map((e) => e.muscleGrams!), "end") - edge(withMuscle.map((e) => e.muscleGrams!), "start") : null;
  const fatMass = (e: WeightEntry) => (e.grams * e.bodyFat!) / 100;
  const fat = withFat.length >= 4 ? edge(withFat.map(fatMass), "end") - edge(withFat.map(fatMass), "start") : null;
  const other = muscle !== null && fat !== null ? weight - muscle - fat : null;

  return { weight, muscle, fat, other, verdict: muscle === null ? null : verdictFor(weight, muscle, fat) };
}

function verdictFor(weight: number, muscle: number, fat: number | null): Verdict {
  const fatNote = fat === null ? "" : fat > NOISE ? ` La masse grasse monte de ${kg(fat)} kg.` : fat < -NOISE ? ` La masse grasse baisse de ${kg(fat)} kg.` : "";
  if (weight > NOISE) {
    const share = muscle / weight;
    if (share >= 0.5)
      return { tone: "good", icon: "💪", title: "Prise de qualité", text: `Tu prends ${kg(weight)} kg, dont ${kg(muscle)} kg de muscle (${pct(share)}).${fatNote}` };
    if (muscle > NOISE)
      return { tone: "neutral", icon: "↗️", title: "Prise mixte", text: `Tu prends ${kg(weight)} kg : ${kg(muscle)} kg de muscle (${pct(share)}), le reste surtout du gras ou de l'eau.${fatNote}` };
    return { tone: "bad", icon: "⚠️", title: "Prise surtout de gras", text: `Tu prends ${kg(weight)} kg mais le muscle ${muscle < -NOISE ? `baisse de ${kg(muscle)} kg` : "ne bouge pas"}. Un peu plus de protéines et de musculation aiderait.${fatNote}` };
  }
  if (weight < -NOISE) {
    const lost = -weight;
    const musclePart = muscle < 0 ? -muscle / lost : 0;
    if (musclePart <= 0.2)
      return { tone: "good", icon: "🔥", title: "Perte propre", text: `Tu perds ${kg(weight)} kg et ${muscle < -NOISE ? `seulement ${kg(muscle)} kg de muscle (${pct(musclePart)})` : "ton muscle est conservé"}.${fatNote}` };
    if (musclePart >= 0.5)
      return { tone: "bad", icon: "⚠️", title: "Tu perds du muscle", text: `Sur ${kg(weight)} kg perdus, ${kg(muscle)} kg sont du muscle (${pct(musclePart)}). Ralentis le déficit, mange plus de protéines et garde la musculation.${fatNote}` };
    return { tone: "neutral", icon: "↘️", title: "Perte mixte", text: `Tu perds ${kg(weight)} kg dont ${kg(muscle)} kg de muscle (${pct(musclePart)}).${fatNote}` };
  }
  if (muscle > NOISE && fat !== null && fat < -NOISE)
    return { tone: "good", icon: "🏆", title: "Recomposition", text: `Poids stable, mais +${kg(muscle)} kg de muscle et −${kg(fat)} kg de gras : c'est le meilleur scénario.` };
  if (muscle > NOISE) return { tone: "good", icon: "💪", title: "Muscle en hausse", text: `Poids stable et +${kg(muscle)} kg de muscle.${fatNote}` };
  if (muscle < -NOISE) return { tone: "bad", icon: "⚠️", title: "Muscle en baisse", text: `Poids stable mais −${kg(muscle)} kg de muscle : le poids que tu gardes est plus gras.${fatNote}` };
  return { tone: "neutral", icon: "➖", title: "Stable", text: `Poids et muscle n'ont presque pas bougé.${fatNote}` };
}
