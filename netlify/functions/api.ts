import serverless from 'serverless-http';
import { app, connectMongo } from '../../server';

// Initialize MongoDB connection once per function instance
let isConnected = false;

const handler = async (event: any, context: any) => {
  if (!isConnected) {
    await connectMongo();
    isConnected = true;
  }
  
  // Wrap the express app
  const serverlessHandler = serverless(app);
  return serverlessHandler(event, context);
};

export { handler };
