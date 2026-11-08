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
  vapidSubject: process.env.VAPID_SUBJECT ?? `mailto:${process.env.ADMIN_EMAIL ?? process.env.USER1_EMAIL ?? "maison@example.com"}`,
};

if (!env.jwtSecret) throw new Error("JWT_SECRET manquant");
// un secret court se devine : il permettrait de fabriquer de faux cookies de session
if (env.isProd && env.jwtSecret.length < 32) throw new Error("JWT_SECRET trop court (32 caractères minimum, ex. openssl rand -hex 32)");
