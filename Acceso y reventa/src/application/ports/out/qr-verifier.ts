export interface QrVerifier {
  verificar(codigo: string, firma: string): boolean;
}
