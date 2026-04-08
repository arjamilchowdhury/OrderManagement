import { MongoClient } from 'mongodb';

const MONGO_URI = 'mongodb://120.50.3.13:27017/admin';

async function fixUsers() {
  const client = await MongoClient.connect(MONGO_URI);
  const db = client.db();
  const users = await db.collection('users').find({}).toArray();
  
  for (const user of users) {
    if (!user.uid) {
      await db.collection('users').updateOne(
        { _id: user._id },
        { $set: { uid: user._id.toString() } }
      );
      console.log(`Updated user ${user.email} with uid ${user._id.toString()}`);
    }
  }
  
  await client.close();
}
fixUsers();
