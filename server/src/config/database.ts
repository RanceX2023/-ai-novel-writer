import mongoose from 'mongoose';

let cachedConnection: typeof mongoose | null = null;

export async function connectDatabase(uri?: string): Promise<typeof mongoose> {
  if (cachedConnection) {
    return cachedConnection;
  }

  const mongoUri = uri || process.env.MONGO_URI || 'mongodb://localhost:27017/ai_novel_writer';

  mongoose.set('strictQuery', false);

  const connection = await mongoose.connect(mongoUri);
  cachedConnection = connection;
  return connection;
}

export async function disconnectDatabase(): Promise<void> {
  if (!cachedConnection) {
    return;
  }
  await mongoose.disconnect();
  cachedConnection = null;
}
