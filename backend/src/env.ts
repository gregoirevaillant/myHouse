try {
  process.loadEnvFile();
} catch {
  // pas de .env : variables fournies par l'environnement (Docker)
}

export const env = {
  port: Number(process.env.PORT ?? 3000),
  jwtSecret: process.env.JWT_SECRET ?? "",
  dataDir: process.env.DATA_DIR ?? "./data",
  isProd: process.env.NODE_ENV === "production",
  // notifications push : clés VAPID générées dans DATA_DIR si absentes
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? "",
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? "",
  // page Médias : bases de données interrogées par le serveur (facultatives)
  tmdbKey: process.env.TMDB_API_KEY ?? "",
  igdbId: process.env.IGDB_CLIENT_ID ?? "",
  igdbSecret: process.env.IGDB_CLIENT_SECRET ?? "",
  // page Poids : clé d'API personnelle Garmin Connect (facultative, la synchronisation est désactivée sans clé)
  garminKey: process.env.GARMIN_API_KEY ?? "",
  // page Sport : dossier du résumé Garmin préparé sur l'ordinateur (monté en lecture seule)
  garminDataDir: process.env.GARMIN_DATA_DIR ?? "./garmin-data",
  vapidSubject: process.env.VAPID_SUBJECT ?? `mailto:${process.env.ADMIN_EMAIL ?? process.env.USER1_EMAIL ?? "maison@example.com"}`,
};

if (!env.jwtSecret) throw new Error("JWT_SECRET manquant");
// un secret court se devine : il permettrait de fabriquer de faux cookies de session
if (env.isProd && env.jwtSecret.length < 32) throw new Error("JWT_SECRET trop court (32 caractères minimum, ex. openssl rand -hex 32)");
