import type { Db } from "mongodb";

export async function crearIndices(db: Db): Promise<void> {
  // Índice compuesto { boletaCodigo: 1, resultado: 1 } cubre consultas por boletaCodigo
  // sin chocar en clave con el índice único parcial uniq_acceso_aceptado_por_boleta.
  await db.collection("accesos").createIndex({ boletaCodigo: 1, resultado: 1 });
  await db.collection("accesos").createIndex(
    { boletaCodigo: 1 },
    {
      unique: true,
      partialFilterExpression: { resultado: "aceptado" },
      name: "uniq_acceso_aceptado_por_boleta",
    },
  );

  await db.collection("reventas").createIndex({ boletaCodigo: 1 });
  await db
    .collection("reventas")
    .createIndex({ vendedorId: 1, registradaEn: -1 });
}
