import { MongoClient, type Db } from "mongodb";

let client: MongoClient | undefined;

export async function conectarMongo(uri: string): Promise<Db> {
  client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  return client.db();
}

export async function cerrarMongo(): Promise<void> {
  await client?.close();
}
