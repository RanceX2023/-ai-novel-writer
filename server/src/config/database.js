const mongoose = require('mongoose');

let cachedConnection = null;

async function connectDatabase(uri) {
  if (cachedConnection) {
    return cachedConnection;
  }

  const mongoUri = uri || process.env.MONGO_URI || 'mongodb://localhost:27017/ai_novel_writer';

  mongoose.set('strictQuery', false);

  const connection = await mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  cachedConnection = connection;
  return connection;
}

module.exports = {
  connectDatabase,
};
