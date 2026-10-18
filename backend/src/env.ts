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
};

if (!env.jwtSecret) throw new Error("JWT_SECRET manquant");
