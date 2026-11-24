import { MongoClient, type Db } from "mongodb";

let client: MongoClient | null = null;

export async function conectarMongo(uri: string, dbName: string): Promise<Db> {
  client = new MongoClient(uri);
  await client.connect();
  return client.db(dbName);
}

export async function cerrarMongo(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
  }
}
