import { MongoClient } from 'mongodb';

const MONGO_URI = 'mongodb://120.50.3.13:27017/admin';

async function addUser() {
  const client = await MongoClient.connect(MONGO_URI);
  const db = client.db();
  await db.collection('users').insertOne({
    uid: "user_" + Date.now(),
    name: "Admin User",
    email: "1914551025@uits.edu.bd",
    password: "password",
    role: "admin"
  });
  console.log("User added");
  await client.close();
}
addUser();
