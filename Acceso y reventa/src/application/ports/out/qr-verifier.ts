export interface QrVerifier {
  verificar(codigo: string, firma: string): boolean;
  firmar?(codigo: string): string;
}

export interface QrSigner {
  firmar(codigo: string): string;
}
