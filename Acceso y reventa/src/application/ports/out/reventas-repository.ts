export interface ReventaRepository {
  existeSospechosaPorBoleta(boletaCodigo: string): Promise<boolean>;
  contarCompletadasPorBoleta?(boletaCodigo: string): Promise<number>;
}

export interface EstadoTransferenciasRepository extends ReventaRepository {
  contarCompletadasPorBoleta(boletaCodigo: string): Promise<number>;
}
