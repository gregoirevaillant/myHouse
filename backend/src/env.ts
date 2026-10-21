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
  // connexion bancaire (Enable Banking) : désactivée si non configurée
  ebAppId: process.env.EB_APP_ID ?? "",
  ebPrivateKeyPath: process.env.EB_PRIVATE_KEY_PATH ?? "",
  // notifications push : clés VAPID générées dans DATA_DIR si absentes
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? "",
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? "",
  vapidSubject: process.env.VAPID_SUBJECT ?? `mailto:${process.env.USER1_EMAIL ?? "maison@example.com"}`,
  publicUrl: (process.env.PUBLIC_URL ?? "http://localhost:5173").replace(/\/$/, ""),
};

export const bankEnabled = !!(env.ebAppId && env.ebPrivateKeyPath);

if (!env.jwtSecret) throw new Error("JWT_SECRET manquant");
