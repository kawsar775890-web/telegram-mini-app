const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const { Telegraf } = require('telegraf');

const app = express();
app.use(express.json());

// ---------------- TELEGRAM BOT CONFIGURATION ----------------
const BOT_TOKEN = '8875784523:AAGZJ-gg5eo8gKBmi3E0nf_YD_jpgLOMoIg';
const ADMIN_CHAT_ID = '-1004469681571';

const bot = new Telegraf(BOT_TOKEN);

// ---------------- MONGODB USER STATUS SCHEMA ----------------
const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    status: { type: String, default: 'unverified' } // 'active', 'rejected', 'blocked', 'unverified'
});

const UserStatusModel = mongoose.model('UserStatus', userSchema);

// ডাটাবেজ থেকে স্ট্যাটাস পাওয়ার হেল্পার ফাংশন
async function getUserStatusFromDB(userId) {
    try {
        const user = await UserStatusModel.findOne({ userId: userId.toString() });
        return user ? user.status : 'unverified';
    } catch (err) {
        console.error("DB Fetch Error:", err);
        return 'unverified';
    }
}

// ডাটাবেজে স্ট্যাটাস সেভ বা আপডেট করার হেল্পার ফাংশন
async function setUserStatusInDB(userId, status) {
    try {
        await UserStatusModel.findOneAndUpdate(
            { userId: userId.toString() },
            { status: status },
            { upsert: true, new: true }
        );
    } catch (err) {
        console.error("DB Save Error:", err);
    }
}

// সঠিকভাবে ইউজার আইডি এক্সট্রাক্ট করার ফাংশন
function extractUserId(text) {
    // যেমন: /approved 7643638811 বা /approved7643638811 উভয় ক্ষেত্রেই কাজ করবে
    const cleanText = text.replace(/\/approved|\/approve|\/reject|\/block/gi, '').replace(/@HubBD_Bot/gi, '').trim();
    return cleanText;
}

// গ্রুপ মেসেজ ও কমান্ড প্রসেস করা
bot.on('text', async (ctx) => {
    const text = ctx.message.text ? ctx.message.text.trim() : '';

    // ১. /approved বা /approve
    if (text.startsWith('/approved') || text.startsWith('/approve')) {
        const userId = extractUserId(text);

        if (userId && !isNaN(userId)) {
            await setUserStatusInDB(userId, 'active');

            await ctx.reply(`✅ <b>Account Activated!</b>\nUser ID: <code>${userId}</code> সফলভাবে অ্যাক্টিভ করা হয়েছে।`, { parse_mode: 'HTML' });

            bot.telegram.sendMessage(userId, "🎉 <b>অভিনন্দন!</b> আপনার একাউন্টটি সফলভাবে অ্যাক্টিভ করা হয়েছে। এখন আপনি কাজ ও টাকা উত্তোলন করতে পারবেন।", { parse_mode: 'HTML' })
            .catch(err => console.log("User DM Error:", err));
        } else {
            await ctx.reply("❌ সঠিক ইউজার আইডি দিন। উদাহরণ: `/approved 7643638811`", { parse_mode: 'HTML' });
        }
    }

    // ২. /reject
    else if (text.startsWith('/reject')) {
        const userId = extractUserId(text);

        if (userId && !isNaN(userId)) {
            await setUserStatusInDB(userId, 'rejected');

            await ctx.reply(`❌ <b>Request Rejected!</b>\nUser ID: <code>${userId}</code>-এর অ্যাক্টিভেশন রিকোয়েস্ট বাতিল করা হয়েছে।`, { parse_mode: 'HTML' });

            bot.telegram.sendMessage(userId, "⚠️ <b>রিকোয়েস্ট বাতিল!</b> আপনার প্রদানকৃত TrxID বা তথ্যটি সঠিক ছিল না। সঠিক তথ্য দিয়ে আবার চেষ্টা করুন।", { parse_mode: 'HTML' })
            .catch(err => console.log("User DM Error:", err));
        } else {
            await ctx.reply("❌ সঠিক ইউজার আইডি দিন। উদাহরণ: `/reject 7643638811`", { parse_mode: 'HTML' });
        }
    }

    // ৩. /block
    else if (text.startsWith('/block')) {
        const userId = extractUserId(text);

        if (userId && !isNaN(userId)) {
            await setUserStatusInDB(userId, 'blocked');

            await ctx.reply(`🚫 <b>User Blocked!</b>\nUser ID: <code>${userId}</code> সফলভাবে ব্লক করা হয়েছে।`, { parse_mode: 'HTML' });

            bot.telegram.sendMessage(userId, "🚫 <b>অ্যাকাউন্ট ব্লকড!</b> নিয়ম লঙ্ঘনের কারণে আপনার অ্যাকাউন্ট ব্লক করা হয়েছে।", { parse_mode: 'HTML' })
            .catch(err => console.log("User DM Error:", err));
        } else {
            await ctx.reply("❌ সঠিক ইউজার আইডি দিন। উদাহরণ: `/block 7643638811`", { parse_mode: 'HTML' });
        }
    }
});

// ওয়েবঅ্যাপ থেকে ইউজার স্ট্যাটাস চেক করার API Endpoint
app.get('/api/check-status/:userId', async (req, res) => {
    const userId = req.params.userId;
    const status = await getUserStatusFromDB(userId);
    res.json({ status: status });
});

// Serve Static Files from Root Directory
app.use(express.static(__dirname));

// Connect Database & Start Server
const PORT = process.env.PORT || 3000;

function startServer() {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        bot.launch().then(() => console.log("Telegram Bot Backend is Running..."))
          .catch(err => console.log("Bot launch error:", err));
    });
}

if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('MongoDB Connected Successfully');
        startServer();
    })
    .catch(err => {
        console.error('MongoDB Connection Error:', err);
        startServer();
    });
} else {
  console.log('Warning: MONGO_URI is not defined! Using fallback.');
  startServer();
}

// Serve index.html from Root (Keep this at the very bottom)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
