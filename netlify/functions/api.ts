import serverless from 'serverless-http';
import { app, connectMongo } from '../../server';

// Initialize MongoDB connection once per function instance
let isConnected = false;

const handler = async (event: any, context: any) => {
  if (!isConnected) {
    await connectMongo();
    isConnected = true;
  }
  
  // Wrap the express app with the correct basePath so Netlify routes work
  const serverlessHandler = serverless(app, {
    basePath: '/.netlify/functions'
  });
  return serverlessHandler(event, context);
};

export { handler };
