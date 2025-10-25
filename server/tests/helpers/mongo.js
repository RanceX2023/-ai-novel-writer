const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoInstance;

async function connect() {
  mongoInstance = await MongoMemoryServer.create();
  const uri = mongoInstance.getUri();

  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
}

async function disconnect() {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  if (mongoInstance) {
    await mongoInstance.stop();
  }
}

async function clearDatabase() {
  const collections = mongoose.connection.collections;
  await Promise.all(
    Object.values(collections).map((collection) => collection.deleteMany())
  );
}

module.exports = {
  connect,
  disconnect,
  clearDatabase,
};
