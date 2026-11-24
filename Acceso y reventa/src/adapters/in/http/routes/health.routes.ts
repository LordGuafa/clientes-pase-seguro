import { Router } from "express";
import type { Db } from "mongodb";
import { healthController, readinessController } from "../controllers/health.controller.ts";

export function healthRoutes(db: Db): Router {
  return Router()
    .get("/health", healthController)
    .get("/health/ready", readinessController(db));
}
