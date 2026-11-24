export interface QrVerifier {
  verificar(codigo: string, firma: string): boolean;
}

export interface QrSigner {
  firmar(codigo: string): string;
}
