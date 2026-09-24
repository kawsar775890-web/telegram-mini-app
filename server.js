const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
app.use(express.json());

// Static Files Serve
app.use(express.static(path.join(__dirname, 'public')));

// Database Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error(err));

// Root Route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));    let user = await User.findOne({ telegramId });
    if (!user) {
      user = new User({ telegramId, name, username, referredBy });
      await user.save();
      
      // If referred by someone, increment referral count
      if (referredBy) {
        const referrer = await User.findOne({ telegramId: referredBy });
        if (referrer) {
          referrer.referrals += 1;
          await referrer.save();
        }
      }
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Activation Submission
app.post('/api/user/activate', async (req, res) => {
  const { telegramId, screenshotUrl } = req.body;
  try {
    const user = await User.findOne({ telegramId });
    if (user) {
      user.isActive = true; // Auto-active for basic flow or pending status
      
      // Unlock Watch Video button for Referrer if applicable
      if (user.referredBy) {
        const referrer = await User.findOne({ telegramId: user.referredBy });
        if (referrer) {
          referrer.canWatchVideo = true;
          await referrer.save();
        }
      }
      await user.save();
      res.json({ success: true, message: 'Account activation request received!' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Complete Task (Watch Video)
app.post('/api/user/task-complete', async (req, res) => {
  const { telegramId } = req.body;
  try {
    const user = await User.findOne({ telegramId });
    if (user && user.canWatchVideo) {
      user.balance += 20;
      user.totalEarned += 20;
      user.canWatchVideo = false; // Hide button until next referral
      await user.save();
      res.json({ success: true, balance: user.balance });
    } else {
      res.status(400).json({ error: 'Task not available' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Withdraw Request
app.post('/api/user/withdraw', async (req, res) => {
  const { telegramId, method, number, amount } = req.body;
  try {
    const user = await User.findOne({ telegramId });
    if (user && user.balance >= amount) {
      user.balance -= amount;
      const record = { method, number, amount, date: new Date().toLocaleDateString(), status: 'Pending' };
      user.withdrawHistory.push(record);
      await user.save();
      res.json({ success: true, message: 'Withdraw request successful!' });
    } else {
      res.status(400).json({ error: 'Insufficient balance' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
