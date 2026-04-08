import { MongoClient } from 'mongodb';

const MONGO_URI = 'mongodb://120.50.3.13:27017/admin';

async function cleanUp() {
  try {
    const client = await MongoClient.connect(MONGO_URI);
    const db = client.db();
    
    // Delete the previously created test user
    const deleteResult = await db.collection('users').deleteOne({ email: '1914551025@uits.edu.bd' });
    console.log('Deleted test user:', deleteResult.deletedCount);
    
    // Verify jamil.sap@gmadhaka.com exists
    const jamilUser = await db.collection('users').findOne({ email: 'jamil.sap@gmadhaka.com' });
    console.log('Jamil user found:', jamilUser);
    
    await client.close();
  } catch (e) {
    console.error(e);
  }
}
cleanUp();
