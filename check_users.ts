import { MongoClient } from 'mongodb';

const MONGO_URI = 'mongodb://120.50.3.13:27017/admin';

async function check() {
  const client = await MongoClient.connect(MONGO_URI);
  const db = client.db();
  const users = await db.collection('users').find({}).toArray();
  console.log(JSON.stringify(users, null, 2));
  await client.close();
}
check();
