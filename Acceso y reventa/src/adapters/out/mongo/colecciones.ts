import type { Db } from "mongodb";

export function colecciones(db: Db) {
  return db.databaseName === "pase-seguro-test"
    ? { accesos: "accesos-test", reventas: "reventas-test" }
    : { accesos: "accesos", reventas: "reventas" };
}
