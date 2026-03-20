import express from 'express';
import cookieParser from 'cookie-parser';
import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

// Firebase Admin Initialization
const firebaseConfig = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
};

if (!admin.apps.length && firebaseConfig.privateKey) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(firebaseConfig as any),
    });
    console.log('Firebase Admin initialized');
  } catch (error) {
    console.error('Firebase Admin Error:', error);
  }
}

const app = express();
const router = express.Router();

app.use(express.json());
app.use(cookieParser());

// --- ROUTES ---

// 1. Root Route (Check karne ke liye ke API zinda hai)
router.get('/', (req, res) => {
  res.json({ 
    status: 'online',
    message: 'Gamer Zone API is working perfectly!',
    timestamp: new Date().toISOString()
  });
});

// 2. Debug/Test Route
router.get('/test', (req, res) => {
  res.json({ 
    message: 'Test route is working!', 
    time: new Date().toISOString()
  });
});

// 3. Push Notification Route
router.post('/send-push', async (req, res) => {
  try {
    const { title, body, targetUserId } = req.body;
    
    if (!admin.apps.length) {
       return res.status(500).json({ error: 'Firebase Admin not initialized' });
    }

    let tokens: string[] = [];

    if (targetUserId) {
      // Specific user ko bhejna
      const userDoc = await admin.firestore().collection('users').doc(targetUserId).get();
      if (userDoc.exists) {
        const user = userDoc.data();
        if (user?.fcmTokens && Array.isArray(user.fcmTokens)) {
          tokens = user.fcmTokens;
        }
      }
    } else {
      // Sab users ko bhejna
      const usersSnap = await admin.firestore().collection('users').get();
      usersSnap.forEach(doc => {
        const user = doc.data();
        if (user.fcmTokens && Array.isArray(user.fcmTokens)) {
          tokens = tokens.concat(user.fcmTokens);
        }
      });
    }

    if (tokens.length === 0) {
      return res.status(404).json({ error: 'No tokens found' });
    }

    const message = {
      notification: { title, body },
      tokens: [...new Set(tokens)].slice(0, 500)
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    res.json({ 
      success: true, 
      count: response.successCount,
      failureCount: response.failureCount 
    });
  } catch (err: any) {
    console.error('Push Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- MOUNTING ---
// Netlify functions ke liye router ko '/' aur '/api' dono par mount karte hain
app.use('/api', router);
app.use('/', router);

export { app };

// Local Server (Sirf local development ke liye)
if (process.env.NODE_ENV !== 'production' || !process.env.NETLIFY) {
  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
