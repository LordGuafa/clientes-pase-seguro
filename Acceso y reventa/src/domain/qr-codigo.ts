const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// El QR es "codigo.firma". Aquí solo se valida el formato, no la firma.
export function parseQr(qr: string): { codigo: string; firma: string } | null {
  const partes = qr.split(".");
  if (partes.length !== 2) return null;
  const [codigo, firma] = partes;
  if (!UUID.test(codigo) || firma.length === 0) return null;
  return { codigo, firma };
}
