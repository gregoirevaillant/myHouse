import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";

export async function userRoutes(app: FastifyInstance) {
  app.get("/", async (req) =>
    prisma.user.findMany({
      where: { householdId: req.user.householdId },
      select: { id: true, name: true, email: true },
      orderBy: { email: "asc" },
    }),
  );
}
