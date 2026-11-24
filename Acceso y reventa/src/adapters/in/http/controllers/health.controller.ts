import type { RequestHandler } from "express";
import type { Db } from "mongodb";

const TIMEOUT_MS = 2000;

async function pingMongo(db: Db): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      db.command({ ping: 1 }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS);
      }),
    ]);
    return true;
  } catch (e) {
    console.error("Health: Mongo no responde:", e);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export const healthController: RequestHandler = (_req, res) => {
  res.status(200).json({ status: "ok" });
};

export function readinessController(db: Db): RequestHandler {
  return async (_req, res) => {
    const mongoOk = await pingMongo(db);
    res.status(mongoOk ? 200 : 503).json({
      status: mongoOk ? "ok" : "degradado",
      mongo: mongoOk ? "ok" : "caído",
    });
  };
}
