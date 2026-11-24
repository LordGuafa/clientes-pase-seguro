export interface ReventaRepository {
  existeSospechosaPorBoleta(boletaCodigo: string): Promise<boolean>;
}
