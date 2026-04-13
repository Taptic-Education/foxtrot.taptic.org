require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const costCenterRoutes = require('./routes/costCenters');
const transactionRoutes = require('./routes/transactions');
const paymentRoutes = require('./routes/payments');
const fundRequestRoutes = require('./routes/fundRequests');
const auditRoutes = require('./routes/audit');
const reportRoutes = require('./routes/reports');
const settingsRoutes = require('./routes/settings');
const setupRoutes = require('./routes/setup');
const dashboardRoutes = require('./routes/dashboard');
const scheduledTransferRoutes = require('./routes/scheduledTransfers');
const { csrfProtection, apiLimiter } = require('./middleware/security');
const { startScheduler } = require('./lib/scheduler');

const app = express();
const PORT = process.env.PORT || 3001;

app.set('trust proxy', 1);

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(cors({
  origin: process.env.APP_URL || 'http://localhost:5173',
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(apiLimiter);
app.use(csrfProtection);
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/cost-centers', costCenterRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/fund-requests', fundRequestRoutes);
app.use('/api/audit-log', auditRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/setup', setupRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/scheduled-transfers', scheduledTransferRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

app.listen(PORT, () => {
  console.log(`Foxtrot API running on port ${PORT}`);
  startScheduler();
});
