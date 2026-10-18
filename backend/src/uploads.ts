import type { FastifyReply, FastifyRequest } from "fastify";
import { createReadStream } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { env } from "./env.js";

const uploadDir = path.resolve(env.dataDir, "uploads");

const IMAGE_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "image/gif": ".gif",
  "image/avif": ".avif",
};

export type Multipart = { fields: Record<string, string>; image?: { buffer: Buffer; mimetype: string } };

// Lit un formulaire multipart : champs texte + un fichier image facultatif nommé "image"
export async function readMultipart(req: FastifyRequest): Promise<Multipart> {
  const fields: Record<string, string> = {};
  let image: Multipart["image"];
  for await (const part of req.parts()) {
    if (part.type === "file") {
      if (part.fieldname !== "image") {
        await part.toBuffer();
      } else if (IMAGE_EXT[part.mimetype]) {
        image = { buffer: await part.toBuffer(), mimetype: part.mimetype };
      } else {
        throw Object.assign(new Error("Format d'image non pris en charge (JPEG, PNG, HEIC…)"), { statusCode: 400 });
      }
    } else {
      fields[part.fieldname] = String(part.value);
    }
  }
  return { fields, image };
}

export async function saveImage(image: NonNullable<Multipart["image"]>) {
  await mkdir(uploadDir, { recursive: true });
  const name = randomUUID() + IMAGE_EXT[image.mimetype];
  await writeFile(path.join(uploadDir, name), image.buffer);
  return name;
}

export async function removeImage(name: string | null) {
  if (name) await unlink(path.join(uploadDir, name)).catch(() => {});
}

export function sendImage(reply: FastifyReply, name: string) {
  const ext = path.extname(name);
  const mime = Object.entries(IMAGE_EXT).find(([, e]) => e === ext)?.[0] ?? "application/octet-stream";
  return reply
    .type(mime)
    .header("Cache-Control", "private, max-age=86400")
    .send(createReadStream(path.join(uploadDir, name)));
}
