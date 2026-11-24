export interface Reventa {
  id: string;
  vendedorId: string;
  compradorId: string;
  precio: number;
  estado: string;
  boletaCodigo: string;
  marcaSospechosa: boolean;
  registradaEn: Date;
}
