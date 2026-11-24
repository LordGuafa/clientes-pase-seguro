import type { Db } from "mongodb";

export async function crearIndices(db: Db): Promise<void> {
  const accesos = db.collection("accesos");
  await accesos.createIndex({ boletaCodigo: 1 });
  await accesos.createIndex({ eventoId: 1 });
  // Cierra la carrera de doble escaneo: solo un ingreso "aceptado" por boletaCodigo
  await accesos.createIndex(
    { boletaCodigo: 1 },
    {
      unique: true,
      name: "uniq_boleta_acceso_aceptado",
      partialFilterExpression: { resultado: "aceptado" },
    },
  );

  const reventas = db.collection("reventas");
  await reventas.createIndex({ boletaCodigo: 1 });
  await reventas.createIndex({ vendedorId: 1 });
  await reventas.createIndex({ marcaSospechosa: 1 });
}
