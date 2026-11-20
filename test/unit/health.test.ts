import { describe, expect, it } from "vitest";
import request from "supertest";
import type { Db } from "mongodb";
import { healthRoutes } from "../../src/adapters/in/http/routes/health.routes.ts";
import express from "express";

describe("health routes", () => {
  it("/health responde 200 aunque Mongo falle", async () => {
    const db = {
      command: async () => {
        throw new Error("mongo down");
      },
    } as unknown as Db;
    const app = express();
    app.use(healthRoutes(db));

    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
  });

  it("/health/ready responde 200 si db.command resuelve", async () => {
    const db = {
      command: async () => ({ ok: 1 }),
    } as unknown as Db;
    const app = express();
    app.use(healthRoutes(db));

    const res = await request(app).get("/health/ready");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", mongo: "ok" });
  });

  it("/health/ready responde 503 si db.command rechaza", async () => {
    const db = {
      command: async () => {
        throw new Error("mongo down");
      },
    } as unknown as Db;
    const app = express();
    app.use(healthRoutes(db));

    const res = await request(app).get("/health/ready");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: "degradado", mongo: "caído" });
  });
});
