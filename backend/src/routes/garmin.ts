import type { FastifyInstance } from "fastify";
import { garminConfigured, garminGet } from "../garmin.js";

// Données de santé et de sport lues (lecture seule) sur Garmin Connect. Rien n'est stocké : le serveur reformate
// les réponses de Garmin en objets simples, les garde 3 minutes en mémoire (voir garmin.ts) et ne renvoie que ce que l'écran affiche.

const TZ = "Europe/Paris";
// date du jour pour la personne (et non celle du serveur, en UTC, qui retarde d'un jour entre minuit et 2 h)
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
const shift = (iso: string, days: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const round = (v: unknown, digits = 0) => {
  const n = num(v);
  return n === null ? null : Math.round(n * 10 ** digits) / 10 ** digits;
};

type RawDay = {
  calendarDate?: string;
  movement?: { steps?: { goal?: number; value?: number; distanceInMeters?: number }; floorsAscended?: { value?: number } };
  calories?: { burnedActive?: number; burnedTotal?: number };
  intensityMinutes?: { goal?: number; moderate?: number; vigorous?: number };
  stress?: { avgLevel?: number };
  bodyBattery?: { latestValue?: number };
};

type RawActivity = {
  activityId?: number;
  activityName?: string;
  startTimeLocal?: string;
  activityType?: { typeKey?: string };
  distance?: number;
  duration?: number;
  averageSpeed?: number;
  elevationGain?: number;
  calories?: number;
  averageHR?: number;
  maxHR?: number;
  averageRunningCadenceInStepsPerMinute?: number;
  averageBikingCadenceInRevPerMinute?: number;
  avgPower?: number;
  aerobicTrainingEffect?: number;
  anaerobicTrainingEffect?: number;
  locationName?: string;
  isPR?: boolean;
};

async function loadActivities() {
  const raw = (await garminGet<RawActivity[]>("/activitylist-service/activities/search/activities?start=0&limit=100")) ?? [];
  return raw.flatMap((a) => {
    const [date, time] = (a.startTimeLocal ?? "").split(" ");
    if (!a.activityId || !date) return [];
    return [
      {
        id: a.activityId,
        name: a.activityName ?? "",
        type: a.activityType?.typeKey ?? "other",
        date,
        time: time?.slice(0, 5) ?? "",
        distanceM: round(a.distance),
        durationS: round(a.duration),
        speed: round(a.averageSpeed, 3), // m/s
        elevationGain: round(a.elevationGain),
        calories: round(a.calories),
        avgHr: round(a.averageHR),
        maxHr: round(a.maxHR),
        cadence: round(a.averageRunningCadenceInStepsPerMinute ?? a.averageBikingCadenceInRevPerMinute),
        power: round(a.avgPower),
        aerobic: round(a.aerobicTrainingEffect, 1),
        anaerobic: round(a.anaerobicTrainingEffect, 1),
        location: a.locationName || null,
        pr: !!a.isPR,
      },
    ];
  });
}

type RawFitness = {
  chronologicalAge?: number;
  fitnessAge?: number;
  achievableFitnessAge?: number;
  previousFitnessAge?: number;
  components?: Record<string, { value?: number; targetValue?: number } | undefined>;
};

type RawZones = { sport?: string; maxHeartRateUsed?: number; zone1Floor?: number; zone2Floor?: number; zone3Floor?: number; zone4Floor?: number; zone5Floor?: number }[];

type RawSleep = { calendarDate?: string | null; sleepTimeSeconds?: number | null; deepSleepSeconds?: number | null; lightSleepSeconds?: number | null; remSleepSeconds?: number | null; awakeSleepSeconds?: number | null };

export async function garminRoutes(app: FastifyInstance) {
  // sans clé, tout répond 503 : l'écran explique comment l'ajouter
  app.addHook("preHandler", async (_req, reply) => {
    if (!garminConfigured()) return reply.code(503).send({ error: "Garmin n'est pas configuré (GARMIN_API_KEY)" });
  });

  // l'essentiel du moment : 4 dernières semaines jour par jour, 7 derniers jours, âge de forme
  app.get("/overview", async () => {
    const now = today();
    const since = shift(now, -6); // 7 jours glissants : un lundi, une semaine calendaire serait vide
    const [rawDays, activities, fitness] = await Promise.all([
      garminGet<{ data?: RawDay[] }>(`/usersummary-service/v2/dailysummaries?startDate=${shift(now, -27)}&endDate=${now}`),
      loadActivities(),
      garminGet<RawFitness>(`/fitnessage-service/fitnessage/v2/${now}`).catch(() => null), // facultatif : sans lui le reste s'affiche
    ]);

    const days = (rawDays?.data ?? [])
      .flatMap((d) =>
        d.calendarDate
          ? [
              {
                date: d.calendarDate,
                steps: round(d.movement?.steps?.value),
                stepGoal: round(d.movement?.steps?.goal),
                distanceM: round(d.movement?.steps?.distanceInMeters),
                activeKcal: round(d.calories?.burnedActive),
                totalKcal: round(d.calories?.burnedTotal),
                moderateMin: round(d.intensityMinutes?.moderate),
                vigorousMin: round(d.intensityMinutes?.vigorous),
                floors: round(d.movement?.floorsAscended?.value),
                stress: (num(d.stress?.avgLevel) ?? -1) > 0 ? round(d.stress?.avgLevel) : null, // -1 = non mesuré
                bodyBattery: round(d.bodyBattery?.latestValue),
              },
            ]
          : [],
      )
      .sort((a, b) => a.date.localeCompare(b.date));

    const week = activities.filter((a) => a.date >= since);
    // Garmin compte une minute intense comme deux minutes modérées
    const intensity = days.filter((d) => d.date >= since).reduce((sum, d) => sum + (d.moderateMin ?? 0) + 2 * (d.vigorousMin ?? 0), 0);
    const last = days[days.length - 1];

    const comp = fitness?.components ?? {};
    return {
      today: now,
      days,
      intensityGoal: 150,
      stepGoal: last?.stepGoal ?? null,
      week: {
        from: since,
        sessions: week.length,
        distanceM: week.reduce((sum, a) => sum + (a.distanceM ?? 0), 0),
        durationS: week.reduce((sum, a) => sum + (a.durationS ?? 0), 0),
        intensityMin: intensity,
      },
      // le repos cardiaque de Garmin est faussé quand la montre n'est portée que pour le sport : on ne l'affiche pas
      fitness:
        fitness && num(fitness.fitnessAge) !== null
          ? {
              age: round(fitness.fitnessAge, 1),
              realAge: round(fitness.chronologicalAge),
              bestAge: round(fitness.achievableFitnessAge),
              previousAge: round(fitness.previousFitnessAge, 1),
              bodyFat: comp.bodyFat ? { value: round(comp.bodyFat.value, 1), target: round(comp.bodyFat.targetValue, 1) } : null,
              vigorousDays: comp.vigorousDaysAvg ? { value: round(comp.vigorousDaysAvg.value, 1), target: round(comp.vigorousDaysAvg.targetValue, 1) } : null,
              vigorousMinutes: comp.vigorousMinutesAvg ? round(comp.vigorousMinutesAvg.value) : null,
            }
          : null,
    };
  });

  // les 100 dernières sorties (course, vélo, natation…)
  app.get("/activities", async () => loadActivities());

  // zones de fréquence cardiaque et nuits mesurées (vides si la montre ne mesure pas le sommeil)
  app.get("/forme", async () => {
    const now = today();
    const [zones, sleep] = await Promise.all([
      garminGet<RawZones>("/biometric-service/heartRateZones/v2").catch(() => null),
      garminGet<RawSleep[]>(`/sleep-service/sleep/dailySleepSummariesByDate?startDate=${shift(now, -13)}&endDate=${now}`).catch(() => null),
    ]);
    const z = zones?.find((s) => s.sport === "DEFAULT") ?? zones?.[0];
    const floors = z ? [z.zone1Floor, z.zone2Floor, z.zone3Floor, z.zone4Floor, z.zone5Floor].map(num) : [];
    return {
      zones: z && floors.every((f) => f !== null) && num(z.maxHeartRateUsed) !== null ? { max: z.maxHeartRateUsed as number, floors: floors as number[] } : null,
      sleep: (sleep ?? [])
        .filter((s) => s.calendarDate && (num(s.sleepTimeSeconds) ?? 0) > 0)
        .map((s) => ({
          date: s.calendarDate as string,
          seconds: round(s.sleepTimeSeconds) ?? 0,
          deep: round(s.deepSleepSeconds) ?? 0,
          light: round(s.lightSleepSeconds) ?? 0,
          rem: round(s.remSleepSeconds) ?? 0,
          awake: round(s.awakeSleepSeconds) ?? 0,
        }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  });

  // poids visé enregistré dans Garmin Connect (grammes), pour le reprendre dans la page Poids
  app.get("/weight-goal", async () => {
    const now = today();
    const data = await garminGet<{ userGoals?: { userGoalType?: string; goalValue?: number }[] }>(`/goal-service/goal/user/effective/weightgoal/${shift(now, -1)}/${now}`);
    const goal = data?.userGoals?.find((g) => g.userGoalType === "WEIGHT_GRAMS")?.goalValue;
    return { grams: typeof goal === "number" && goal >= 30000 && goal <= 300000 ? Math.round(goal) : null };
  });
}
