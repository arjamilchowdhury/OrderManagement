import { MongoClient } from 'mongodb';

const MONGO_URI = 'mongodb://120.50.3.13:27017/admin';

async function test() {
  try {
    const client = await MongoClient.connect(MONGO_URI);
    const db = client.db();
    const user = await db.collection('users').findOne({ email: '1914551025@uits.edu.bd' });
    console.log(user);
    await client.close();
  } catch (e) {
    console.error(e);
  }
}
test();
