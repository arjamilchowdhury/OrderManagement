import express from 'express';
import { MongoClient, Db, ObjectId } from 'mongodb';
import cors from 'cors';
import multer from 'multer';
import * as xlsx from 'xlsx';
import path from 'path';

import { randomBytes } from 'crypto';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Read-only Viewer Mode Middleware
app.use((req, res, next) => {
  const isViewer = req.headers['x-viewer-mode'] === 'true';
  const method = req.method.toUpperCase();
  if (isViewer && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return res.status(403).json({ error: 'Forbidden: Cannot modify data in read-only view mode.' });
  }
  next();
});

const MONGO_URI = 'mongodb://120.50.3.13:27017/admin';
let db: Db;

async function connectMongo() {
  try {
    const client = await MongoClient.connect(MONGO_URI);
    db = client.db();
    console.log('Connected to MongoDB');

    // Create indexes for fast searching
    const collection = db.collection('orders_management');
    await collection.createIndex({ OrderNumber: 1 });
    await collection.createIndex({ SalesDocument: 1 });
    await collection.createIndex({ BatchNumber: 1 });
    await collection.createIndex({ "Material Number": 1 });
    await collection.createIndex({ Status: 1 });
    await collection.createIndex({ OrderDate: -1 });
  } catch (error) {
    console.error('Failed to connect to MongoDB', error);
  }
}

// API Routes
app.get('/api/orders', async (req, res) => {
  try {
    const { page = 1, limit = 50, searchField, searchText, statusFilters } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    
    let query: any = {};
    
    // Improved search logic to handle numeric fields and partial string matches
    if (searchText && searchField) {
      const searchStr = String(searchText).trim();
      const field = String(searchField);
      
      const orConditions: any[] = [
        { [field]: { $regex: searchStr, $options: 'i' } }
      ];
      
      // If the search text is numeric, also try an exact numeric match
      const numValue = Number(searchStr);
      if (!isNaN(numValue)) {
        orConditions.push({ [field]: numValue });
      }
      
      query.$or = orConditions;
    }

    if (statusFilters) {
      const statuses = (statusFilters as string).split(',').filter(Boolean);
      if (statuses.length > 0) {
        // Use case-insensitive exact match for statuses
        query.Status = { $in: statuses.map(s => new RegExp(`^${s}$`, 'i')) };
      }
    }

    const total = await db.collection('orders_management').countDocuments(query);
    const orders = await db.collection('orders_management')
      .find(query)
      .sort({ OrderDate: -1 })
      .skip(skip)
      .limit(Number(limit))
      .toArray();

    res.json({
      orders,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
      hasNextPage: skip + orders.length < total
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const order = req.body;
    const result = await db.collection('orders_management').insertOne(order);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create order' });
  }
});

app.put('/api/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const update = req.body;
    delete update._id; // Prevent MongoDB error: Mod on _id not allowed
    const result = await db.collection('orders_management').updateOne({ _id: id as any }, { $set: update });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update order' });
  }
});

app.get('/api/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let query: any = {};
    try {
      query = { _id: new ObjectId(id) };
    } catch (e) {
      query = { Code: id };
    }
    const order = await db.collection('orders_management').findOne(query);
    if (order) {
      res.json(order);
    } else {
      res.status(404).json({ error: 'Order not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

app.patch('/api/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const update = req.body;
    delete update._id; // Prevent MongoDB error: Mod on _id not allowed
    let query: any = {};
    try {
      query = { _id: new ObjectId(id) };
    } catch (e) {
      query = { Code: id };
    }
    const result = await db.collection('orders_management').updateOne(query, { $set: update });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update order' });
  }
});

app.get('/api/club-collection', async (req, res) => {
  try {
    const collection = await db.collection('club_collection').find({}).toArray();
    const result: any = {};
    collection.forEach((item: any) => {
      const { _id, sessionId, ...batches } = item;
      result[sessionId] = batches;
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch club collection' });
  }
});

app.post('/api/club-collection/sync', async (req, res) => {
  try {
    const { sessionId, batchKey, batchData, rows } = req.body;
    await db.collection('club_collection').updateOne(
      { sessionId },
      { $set: { [batchKey]: batchData } },
      { upsert: true }
    );
    if (rows && rows.length > 0) {
      const bulkOps = rows.map((row: any) => {
        const detailKey = `${row.orderId}${row.material}`;
        return {
          updateOne: {
            filter: { Code: detailKey },
            update: {
              $set: {
                OrderNumber: String(row.orderId || ''),
                SalesDocument: String(row.salesDoc || ''),
                OrderDate: row.orderDate,
                BatchNumber: String(batchKey || ''),
                Year: String(new Date(row.orderDate).getFullYear() || "2025"),
                "Material Number": String(row.material || ''),
                ClubName: row.clubName,
                OrderType: null,
                Status: "file preparing",
                CDD: null,
                qty: row.qty,
                sku: row.sku,
                productName: row.productName,
                Code: detailKey
              }
            },
            upsert: true
          }
        };
      });
      await db.collection('orders_management').bulkWrite(bulkOps);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to sync batch' });
  }
});

app.patch('/api/club-collection/update-record', async (req, res) => {
  try {
    const { sessionId, batchKey, fileName, updateData } = req.body;
    const fieldPath = `${batchKey}.${fileName.replace(/\./g, '_DOT_')}`;
    const setObj: any = {};
    for (const key in updateData) {
      setObj[`${fieldPath}.${key}`] = updateData[key];
    }
    await db.collection('club_collection').updateOne(
      { sessionId },
      { $set: setObj }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update record' });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const users = await db.collection('users').find({}).toArray();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.get('/api/users/:uid', async (req, res) => {
  try {
    const { uid } = req.params;
    const user = await db.collection('users').findOne({ uid });
    if (user) {
      res.json(user);
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const user = req.body;
    const result = await db.collection('users').updateOne(
      { uid: user.uid },
      { $set: user },
      { upsert: true }
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to save user' });
  }
});

  app.delete('/api/users/:uid', async (req, res) => {
    try {
      const { uid } = req.params;
      await db.collection('users').deleteOne({ uid });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete user' });
    }
  });

  app.get('/api/share-token/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const tokenDoc = await db.collection('share_tokens').findOne({ user_id: userId, is_active: true });
      if (tokenDoc) {
        res.json({ token: tokenDoc.token });
      } else {
        res.status(404).json({ error: 'Token not found' });
      }
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch token' });
    }
  });

  app.post('/api/share-token', async (req, res) => {
    try {
      const { userId } = req.body;
      const existing = await db.collection('share_tokens').findOne({ user_id: userId, is_active: true });
      if (existing) {
        res.json({ token: existing.token });
        return;
      }
      
      const token = randomBytes(32).toString('base64url');
      await db.collection('share_tokens').insertOne({
        token,
        user_id: userId,
        created_at: new Date(),
        is_active: true
      });
      res.json({ token });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create token' });
    }
  });

  app.delete('/api/share-token/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      await db.collection('share_tokens').updateMany(
        { user_id: userId },
        { $set: { is_active: false } }
      );
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to revoke token' });
    }
  });

  app.get('/api/share-token/validate/:token', async (req, res) => {
    try {
      const { token } = req.params;
      const tokenDoc = await db.collection('share_tokens').findOne({ token, is_active: true });
      if (!tokenDoc) {
        res.status(404).json({ error: 'Token not valid or inactive' });
        return;
      }
      const user = await db.collection('users').findOne({ uid: tokenDoc.user_id });
      if (!user) {
        res.status(404).json({ error: 'Associated user not found' });
        return;
      }
      res.json({
        user: {
          uid: 'viewer', // Mock UID for viewer so they don't share user's explicit actions
          owner_id: user.uid,
          email: 'viewer@shared.link',
          role: 'viewer',
          name: `Guest of ${user.name}`
        }
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to validate token' });
    }
  });

  app.get('/api/master-recon-keys', async (req, res) => {
    try {
      const orders = await db.collection('orders_management').find({}, { projection: { Code: 1 } }).toArray();
      const keys: Record<string, boolean> = {};
      orders.forEach(o => {
        if (o.Code) keys[o.Code] = true;
      });
      res.json(keys);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch master recon keys' });
    }
  });

  app.patch('/api/master-recon-status', async (req, res) => {
    try {
      const { updates } = req.body;
      const bulkOps = Object.keys(updates).map(path => {
        const parts = path.split('/');
        const compositeKey = parts[2];
        const status = updates[path];
        return {
          updateOne: {
            filter: { Code: compositeKey },
            update: { $set: { Status: status } }
          }
        };
      });
      if (bulkOps.length > 0) {
        await db.collection('orders_management').bulkWrite(bulkOps);
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update master recon status' });
    }
  });

  // Mock Auth endpoint
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  // This is a mock login. In a real app, you'd verify password hash.
  try {
    const normalizedEmail = email ? email.trim().toLowerCase() : '';
    const user = await db.collection('users').findOne({ email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') } });
    if (user) {
      if (user.password && String(user.password) !== String(password)) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      res.json({ user });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Auth failed' });
  }
});

app.post('/api/club-order/upload', async (req, res) => {
  try {
    let body = req.body;
    
    // In serverless environments, body might be a string depending on middleware
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        console.error('Failed to parse string body', e);
      }
    }
    
    // Check if the body was completely empty due to limit
    if (!body || Object.keys(body).length === 0) {
      return res.status(400).json({ error: 'Request body is empty or exceeded size limit. Please try with fewer files.' });
    }

    const { batchNumber, files } = body;
    if (!batchNumber) {
      return res.status(400).json({ error: 'Batch number is required' });
    }

    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    const duplicates: any[] = [];
    const nonDuplicates: any[] = [];
    const clubOrderFiles: any = {};
    
    const docOrderIds = new Set<string>();
    const docRushOrderIds = new Set<string>();
    const docMTOOrderIds = new Set<string>();
    const docMultipleSportsOrderIds = new Set<string>();
    let docTotalQty = 0;

    for (const file of files) {
      const fileName = file.fileName;
      const data = file.data;
      if (fileName.toLowerCase().startsWith('combined')) {
        continue;
      }

      const fileOrderIds = new Set<string>();
      let fileTotalQty = 0;
      const fileMaterials = new Set<string>();
      const fileSalesDocs = new Set<string>();

      const lowerName = fileName.toLowerCase();
      const isRush = lowerName.includes('rush rs') || lowerName.includes('rush rsa');
      const isMultipleSports = lowerName.includes('volleyball') || lowerName.includes('basketball') || lowerName.includes('hokey');

      for (const row of data as any[]) {
        const orderId = String(row['Order ID'] || row['OrderNumber'] || row['Order#'] || '');
        if (!orderId) continue;
        
        // Sum the quantity directly to fix Processed Files Quantity
        const qtyKey = Object.keys(row).find(k => k.toLowerCase().replace(/\s/g, '') === 'productqty') || 'Product Qty';
        let rawQty = row[qtyKey];
        if (rawQty === undefined) rawQty = row['Qty'] || row['Quantity'] || row['QTY'];
        const qty = Number(rawQty) || 0;
        
        fileTotalQty += qty;
        fileOrderIds.add(orderId);
        
        // Accumulate order IDs for specific categories
        if (isRush) docRushOrderIds.add(orderId);
        if (isMultipleSports) docMultipleSportsOrderIds.add(orderId);
        if (lowerName.includes('mto')) docMTOOrderIds.add(orderId);

        // Check for duplicate in orders_management explicitly combining order ID and material
        const material = String(row['Material'] || '');
        const detailKey = `${orderId}${material}`;

        // Ensure we don't treat different rows with the same order ID but different materials as duplicates
        const existingOrder = await db.collection('orders_management').findOne({ Code: detailKey });
        
        if (existingOrder) {
          const isFileDuplicate = nonDuplicates.find(nd => nd.Code === detailKey);
          if (!isFileDuplicate) {
             duplicates.push({ orderId, clubName: row['Club Name'] || existingOrder.ClubName, fileName });
          }
        } else {
          // Verify we aren't duplicating within the exact same payload
          const alreadyInPayload = nonDuplicates.find(nd => nd.Code === detailKey);
          if (alreadyInPayload) {
             continue; // ignore exact duplicate row in same file
          }

          const salesDoc = String(row['Sales Document'] || '');
          const clubName = String(row['Club Name'] || '');
          
          let orderType = 'N/A';
          if (salesDoc.startsWith('1000')) orderType = 'ZBC';
          else if (salesDoc.startsWith('450')) orderType = 'ZRP';
          else if (salesDoc.startsWith('75')) orderType = 'ZMO';
          else if (salesDoc.startsWith('650')) orderType = 'ZBO';
          else if (lowerName.includes('mto')) orderType = 'MTO';

          let cddOffset = 4;
          if (lowerName.startsWith('replacement')) cddOffset = 2;
          const cddDate = new Date();
          cddDate.setDate(cddDate.getDate() + cddOffset);
          const cdd = `${cddDate.getMonth() + 1}/${cddDate.getDate()}/${cddDate.getFullYear()}`;

          const newOrder = {
            OrderNumber: orderId,
            SalesDocument: salesDoc,
            "BC Order Date": row['Order Date'],
            OrderDate: row['Order Date'],
            "Material Number": material,
            ClubName: clubName,
            Material: detailKey,
            BatchNumber: batchNumber,
            Year: Number(new Date().getFullYear()),
            status: "Not share",
            CDD: cdd,
            OrderType: orderType,
            qty: qty,
            sku: row['Product SKU'],
            productName: row['Product Name'],
            unitPrice: row['Product Unit Price'],
            Code: detailKey
          };

          nonDuplicates.push(newOrder);

          fileMaterials.add(material);
          fileSalesDocs.add(salesDoc);
          
          if (orderType === 'MTO') docMTOOrderIds.add(orderId);
        }
      }
      
      const safeFileName = fileName.replace(/\./g, '_DOT_');

      if (fileOrderIds.size > 0) {
        clubOrderFiles[safeFileName] = {
          originalName: fileName,
          orderIds: Array.from(fileOrderIds),
          totalOrder: fileOrderIds.size, // Fixed: Uses unique ID count
          totalQty: fileTotalQty, // Fixed: Uses summed numeric values
          materials: Array.from(fileMaterials),
          salesDocs: Array.from(fileSalesDocs),
          assigned: "",
          clubStatus: "Not share",
          batch: batchNumber
        };

        Array.from(fileOrderIds).forEach(id => docOrderIds.add(id));
        docTotalQty += fileTotalQty;
      }
    }

    if (nonDuplicates.length > 0) {
      await db.collection('orders_management').insertMany(nonDuplicates);
    }

    let clubOrderResult = null;
    if (Object.keys(clubOrderFiles).length > 0) {
      const clubOrderDoc = {
        uploadDate: new Date().toLocaleDateString(),
        batch: batchNumber,
        totalOrder: docOrderIds.size,
        totalQty: docTotalQty,
        orderIds: Array.from(docOrderIds),
        rushOrderIds: Array.from(docRushOrderIds),
        mtoOrderIds: Array.from(docMTOOrderIds),
        multipleSportsOrderIds: Array.from(docMultipleSportsOrderIds),
        files: clubOrderFiles
      };
      clubOrderResult = await db.collection('club_order').insertOne(clubOrderDoc);
    }

    // Top Header & Multi-Batch Aggregation: Fetch all uploads for today to aggregate the total output
    const todayStr = new Date().toLocaleDateString();
    const todaysOrders = await db.collection('club_order').find({ uploadDate: todayStr }).toArray();

    let aggregatedTotalQty = 0;
    const aggregatedOrderIds = new Set<string>();
    const aggregatedRush = new Set<string>();
    const aggregatedMTO = new Set<string>();
    const aggregatedMultipleSports = new Set<string>();
    const aggregatedFiles: any = {};
    const batchNumbers = new Set<string>();

    todaysOrders.forEach(order => {
      if (order.batch) batchNumbers.add(order.batch);
      aggregatedTotalQty += (order.totalQty || 0);
      
      (order.orderIds || []).forEach((id: string) => aggregatedOrderIds.add(id));
      (order.rushOrderIds || []).forEach((id: string) => aggregatedRush.add(id));
      (order.mtoOrderIds || []).forEach((id: string) => aggregatedMTO.add(id));
      (order.multipleSportsOrderIds || []).forEach((id: string) => aggregatedMultipleSports.add(id));
      
      if (order.files) {
        Object.assign(aggregatedFiles, order.files);
      }
    });

    res.json({
      success: true,
      clubOrderId: clubOrderResult?.insertedId,
      batch: Array.from(batchNumbers).join(', '),
      duplicates,
      nonDuplicatesCount: nonDuplicates.length,
      metrics: {
        totalOrder: aggregatedOrderIds.size,
        totalQty: aggregatedTotalQty,
        totalRushOrders: aggregatedRush.size,
        totalMTOOrders: aggregatedMTO.size,
        totalMultipleSportsOrders: aggregatedMultipleSports.size,
        totalDuplicateOrders: duplicates.length // Only duplicate count from the current upload
      },
      files: aggregatedFiles
    });

  } catch (error: any) {
    console.error('Error in /api/club-order/upload:', error);
    res.status(500).json({ error: 'Failed to process upload: ' + (error.message || 'Unknown error') });
  }
});

app.put('/api/club-order/update-assignment', async (req, res) => {
  try {
    const { clubOrderId, fileName, assigned } = req.body;
    const safeFileName = fileName.replace(/\./g, '_DOT_');
    const updatePath = `files.${safeFileName}.assigned`;
    await db.collection('club_order').updateOne(
      { _id: new ObjectId(clubOrderId) },
      { $set: { [updatePath]: assigned } }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update assignment' });
  }
});

app.put('/api/club-order/update-status', async (req, res) => {
  try {
    const { clubOrderId, fileName, status } = req.body;
    const safeFileName = fileName.replace(/\./g, '_DOT_');
    const updatePath = `files.${safeFileName}.clubStatus`;
    
    // Update the file status inside the club order record
    await db.collection('club_order').updateOne(
      { _id: new ObjectId(clubOrderId) },
      { $set: { [updatePath]: status } }
    );
    
    // Also sequentially update the 'orders_management' status for all rows in this file batch to keep DB in sync
    const orderDoc = await db.collection('club_order').findOne({ _id: new ObjectId(clubOrderId) });
    if (orderDoc && orderDoc.files && orderDoc.files[safeFileName]) {
        const orderIds = orderDoc.files[safeFileName].orderIds || [];
        if (orderIds.length > 0) {
            await db.collection('orders_management').updateMany(
                { OrderNumber: { $in: orderIds } },
                { $set: { status: status } }
            );
        }
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update status' });
  }
});

app.get('/api/club-order/latest', async (req, res) => {
  try {
    // Top Header: Date, Batch Numbers & Aggregation
    // Aggregate multiple files uploaded on the same day dynamically.
    const todayStr = new Date().toLocaleDateString();
    const todaysOrders = await db.collection('club_order').find({ uploadDate: todayStr }).toArray();

    if (!todaysOrders || todaysOrders.length === 0) {
      // Intentionally fall back to the absolute latest if nothing processed today
      const absoluteLatest = await db.collection('club_order').find().sort({ _id: -1 }).limit(1).toArray();
      if (absoluteLatest.length === 0) {
        return res.json(null);
      }
      todaysOrders.push(absoluteLatest[0]);
    }

    let aggregatedTotalQty = 0;
    const aggregatedOrderIds = new Set<string>();
    const aggregatedRush = new Set<string>();
    const aggregatedMTO = new Set<string>();
    const aggregatedMultipleSports = new Set<string>();
    const aggregatedFiles: any = {};
    const batchNumbers = new Set<string>();
    
    // Pick the most recent doc ID to represent the update assignment target if needed
    const lastId = todaysOrders[todaysOrders.length - 1]._id;

    todaysOrders.forEach(order => {
      if (order.batch) batchNumbers.add(order.batch);
      aggregatedTotalQty += (order.totalQty || 0);
      
      (order.orderIds || []).forEach((id: string) => aggregatedOrderIds.add(id));
      (order.rushOrderIds || []).forEach((id: string) => aggregatedRush.add(id));
      (order.mtoOrderIds || []).forEach((id: string) => aggregatedMTO.add(id));
      (order.multipleSportsOrderIds || []).forEach((id: string) => aggregatedMultipleSports.add(id));
      
      if (order.files) {
        Object.assign(aggregatedFiles, order.files);
      }
    });

    res.json({
      _id: lastId,
      batch: Array.from(batchNumbers).join(', '),
      totalOrder: aggregatedOrderIds.size,
      totalQty: aggregatedTotalQty,
      metrics: {
        totalOrder: aggregatedOrderIds.size,
        totalQty: aggregatedTotalQty,
        totalRushOrders: aggregatedRush.size,
        totalMTOOrders: aggregatedMTO.size,
        totalMultipleSportsOrders: aggregatedMultipleSports.size,
        totalDuplicateOrders: 0 // Will not aggregate historical duplicates
      },
      files: aggregatedFiles
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch latest club order' });
  }
});

app.get('/api/last-updated', async (req, res) => {
  try {
    const latestUpload = await db.collection('club_order').find().sort({ _id: -1 }).limit(1).toArray();
    let lastDate = new Date();
    
    if (latestUpload && latestUpload.length > 0) {
      lastDate = latestUpload[0]._id.getTimestamp();
    }
    
    res.json({ lastUpdated: lastDate.toISOString() });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch last updated date' });
  }
});

export { app, connectMongo };

async function startServer() {
  await connectMongo();

  if (process.env.NODE_ENV !== 'production') {
    const viteModuleName = 'vite';
    const { createServer: createViteServer } = await import(viteModuleName);
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// Only start the server if we are not in a serverless environment
if (!process.env.NETLIFY_FUNCTIONS) {
  startServer();
}
