import { MongoClient } from 'mongodb';

const MONGO_URI = 'mongodb://120.50.3.13:27017/admin';

async function test() {
  try {
    const client = await MongoClient.connect(MONGO_URI);
    console.log('Connected');
    await client.close();
  } catch (e) {
    console.error('Failed to connect', e);
  }
}
test();
