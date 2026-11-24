import type { Db } from "mongodb";

export async function crearIndices(db: Db): Promise<void> {
  await db.collection("accesos").createIndex({ boletaCodigo: 1, resultado: 1 });
  await db.collection("accesos").createIndex({ boletaCodigo: 1 });
  await db
    .collection("reventas")
    .createIndex({ vendedorId: 1, registradaEn: -1 });
  await db.collection("accesos").createIndex(
    { boletaCodigo: 1 },
    {
      unique: true,
      partialFilterExpression: { resultado: "aceptado" },
      name: "uniq_acceso_aceptado_por_boleta",
    },
  );
}
