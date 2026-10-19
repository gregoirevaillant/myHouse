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
  publicUrl: (process.env.PUBLIC_URL ?? "http://localhost:5173").replace(/\/$/, ""),
};

export const bankEnabled = !!(env.ebAppId && env.ebPrivateKeyPath);

if (!env.jwtSecret) throw new Error("JWT_SECRET manquant");
