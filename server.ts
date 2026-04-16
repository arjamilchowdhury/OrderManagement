import express from 'express';
import { MongoClient, Db, ObjectId } from 'mongodb';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import multer from 'multer';
import * as xlsx from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

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

const upload = multer({ storage: multer.memoryStorage() });

app.post('/api/club-order/upload', upload.array('files'), async (req, res) => {
  try {
    const batchNumber = req.body.batchNumber;
    if (!batchNumber) {
      return res.status(400).json({ error: 'Batch number is required' });
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const duplicates: any[] = [];
    const nonDuplicates: any[] = [];
    const clubOrderFiles: any = {};
    let totalOrder = 0;
    let totalQty = 0;
    let totalRushOrders = 0;
    let totalMTOOrders = 0;
    let totalMultipleSportsOrders = 0;

    for (const file of files) {
      const fileName = file.originalname;
      if (fileName.toLowerCase().startsWith('combined')) {
        continue; // Ignore files starting with "combined"
      }

      const workbook = xlsx.read(file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json(sheet);

      let fileTotalOrder = 0;
      let fileTotalQty = 0;
      const fileOrderIds = new Set<string>();
      const fileMaterials = new Set<string>();
      const fileSalesDocs = new Set<string>();

      const isRush = fileName.toLowerCase().includes('rush rs') || fileName.toLowerCase().includes('rush rsa');
      const isMultipleSports = fileName.toLowerCase().includes('volleyball') || fileName.toLowerCase().includes('basketball') || fileName.toLowerCase().includes('hokey');

      for (const row of data as any[]) {
        const orderId = String(row['Order ID'] || '');
        if (!orderId) continue;

        // Check for duplicate in orders_management
        const existingOrder = await db.collection('orders_management').findOne({ OrderNumber: orderId });
        
        if (existingOrder) {
          duplicates.push({ orderId, clubName: row['Club Name'] || existingOrder.ClubName, fileName });
        } else {
          // Transform data
          const salesDoc = String(row['Sales Document'] || '');
          const material = String(row['Material'] || '');
          const clubName = String(row['Club Name'] || '');
          const qty = Number(row['Product Qty']) || 0;
          
          let orderType = 'N/A';
          if (salesDoc.startsWith('1000')) orderType = 'ZBC';
          else if (salesDoc.startsWith('450')) orderType = 'ZRP';
          else if (salesDoc.startsWith('75')) orderType = 'ZMO';
          else if (salesDoc.startsWith('650')) orderType = 'ZBO';
          else if (fileName.toLowerCase().includes('mto')) orderType = 'MTO';

          let cddOffset = 4;
          if (fileName.toLowerCase().startsWith('replacement')) {
            cddOffset = 2;
          }
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
            Material: `${orderId}${material}`,
            BatchNumber: batchNumber,
            year: String(new Date().getFullYear()),
            status: "Not share",
            CDD: cdd,
            OrderType: orderType,
            qty: qty,
            sku: row['Product SKU'],
            productName: row['Product Name'],
            unitPrice: row['Product Unit Price'],
            Code: `${orderId}${material}`
          };

          nonDuplicates.push(newOrder);

          fileTotalOrder++;
          fileTotalQty += qty;
          fileOrderIds.add(orderId);
          fileMaterials.add(material);
          fileSalesDocs.add(salesDoc);

          if (isRush) totalRushOrders++;
          if (orderType === 'MTO') totalMTOOrders++;
          if (isMultipleSports) totalMultipleSportsOrders++;
        }
      }

      // Only add file if it had orders
      if (fileTotalOrder > 0 || fileOrderIds.size > 0) {
        clubOrderFiles[fileName] = {
          orderIds: Array.from(fileOrderIds),
          totalOrder: fileTotalOrder,
          totalQty: fileTotalQty,
          materials: Array.from(fileMaterials),
          salesDocs: Array.from(fileSalesDocs),
          assigned: "",
          clubStatus: "Not share",
          batch: batchNumber
        };

        totalOrder += fileTotalOrder;
        totalQty += fileTotalQty;
      }
    }

    // Store non-duplicates in orders_management
    if (nonDuplicates.length > 0) {
      await db.collection('orders_management').insertMany(nonDuplicates);
    }

    // Store in club_order
    let clubOrderResult = null;
    if (Object.keys(clubOrderFiles).length > 0) {
      const clubOrderDoc = {
        uploadDate: new Date().toLocaleDateString(),
        batch: batchNumber,
        totalOrder,
        totalQty,
        files: clubOrderFiles
      };
      clubOrderResult = await db.collection('club_order').insertOne(clubOrderDoc);
    }

    res.json({
      success: true,
      clubOrderId: clubOrderResult?.insertedId,
      duplicates,
      nonDuplicatesCount: nonDuplicates.length,
      metrics: {
        totalOrder,
        totalQty,
        totalRushOrders,
        totalMTOOrders,
        totalMultipleSportsOrders,
        totalDuplicateOrders: duplicates.length
      },
      files: clubOrderFiles
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to process upload' });
  }
});

app.put('/api/club-order/update-assignment', async (req, res) => {
  try {
    const { clubOrderId, fileName, assigned } = req.body;
    // We need to escape the dot in the filename if it was saved that way, 
    // but in our code above we saved it with the raw filename. 
    // MongoDB allows dots in keys in newer versions, but if it fails, we should handle it.
    // Assuming raw filename is fine.
    const updatePath = `files.${fileName}.assigned`;
    await db.collection('club_order').updateOne(
      { _id: new ObjectId(clubOrderId) },
      { $set: { [updatePath]: assigned } }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update assignment' });
  }
});

app.get('/api/club-order/latest', async (req, res) => {
  try {
    const latest = await db.collection('club_order').find().sort({ _id: -1 }).limit(1).toArray();
    res.json(latest[0] || null);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch latest club order' });
  }
});

export { app, connectMongo };

async function startServer() {
  await connectMongo();

  if (process.env.NODE_ENV !== 'production') {
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
