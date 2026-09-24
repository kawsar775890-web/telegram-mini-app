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

// ইউজার স্ট্যাটাস রাখার মেমোরি
const userStatus = new Map(); // 'active', 'rejected', 'blocked'

function extractUserId(text, commandName) {
    return text.replace(commandName, '').replace('@HubBD_Bot', '').trim();
}

// গ্রুপ মেসেজ ও কমান্ড প্রসেস করা
bot.on('text', (ctx) => {
    const text = ctx.message.text.trim();

    // ১. /approved বা /approve
    if (text.startsWith('/approved') || text.startsWith('/approve')) {
        const cmd = text.startsWith('/approved') ? '/approved' : '/approve';
        const userId = extractUserId(text, cmd);

        if (userId && !isNaN(userId)) {
            userStatus.set(userId, 'active');

            ctx.reply(`✅ <b>Account Activated!</b>\nUser ID: <code>${userId}</code> সফলভাবে অ্যাক্টিভ করা হয়েছে।`, { parse_mode: 'HTML' });

            bot.telegram.sendMessage(userId, "🎉 <b>অভিনন্দন!</b> আপনার একাউন্টটি সফলভাবে অ্যাক্টিভ করা হয়েছে। এখন আপনি কাজ ও টাকা উত্তোলন করতে পারবেন।", { parse_mode: 'HTML' })
            .catch(err => console.log("User DM Error:", err));
        } else {
            ctx.reply("❌ সঠিক ইউজার আইডি দিন। উদাহরণ: `/approved7643638811`", { parse_mode: 'Markdown' });
        }
    }

    // ২. /reject
    else if (text.startsWith('/reject')) {
        const userId = extractUserId(text, '/reject');

        if (userId && !isNaN(userId)) {
            userStatus.set(userId, 'rejected');

            ctx.reply(`❌ <b>Request Rejected!</b>\nUser ID: <code>${userId}</code>-এর অ্যাক্টিভেশন রিকোয়েস্ট বাতিল করা হয়েছে।`, { parse_mode: 'HTML' });

            bot.telegram.sendMessage(userId, "⚠️ <b>রিকোয়েস্ট বাতিল!</b> আপনার প্রদানকৃত TrxID বা তথ্যটি সঠিক ছিল না। সঠিক তথ্য দিয়ে আবার চেষ্টা করুন।", { parse_mode: 'HTML' })
            .catch(err => console.log("User DM Error:", err));
        } else {
            ctx.reply("❌ সঠিক ইউজার আইডি দিন। উদাহরণ: `/reject7643638811`", { parse_mode: 'Markdown' });
        }
    }

    // ৩. /block
    else if (text.startsWith('/block')) {
        const userId = extractUserId(text, '/block');

        if (userId && !isNaN(userId)) {
            userStatus.set(userId, 'blocked');

            ctx.reply(`🚫 <b>User Blocked!</b>\nUser ID: <code>${userId}</code> সফলভাবে ব্লক করা হয়েছে।`, { parse_mode: 'HTML' });

            bot.telegram.sendMessage(userId, "🚫 <b>অ্যাকাউন্ট ব্লকড!</b> নিয়ম লঙ্ঘনের কারণে আপনার অ্যাকাউন্ট ব্লক করা হয়েছে।", { parse_mode: 'HTML' })
            .catch(err => console.log("User DM Error:", err));
        } else {
            ctx.reply("❌ সঠিক ইউজার আইডি দিন। উদাহরণ: `/block7643638811`", { parse_mode: 'Markdown' });
        }
    }
});

// ওয়েবঅ্যাপ থেকে ইউজার স্ট্যাটাস চেক করার API Endpoint
app.get('/api/check-status/:userId', (req, res) => {
    const userId = req.params.userId;
    const status = userStatus.get(userId) || 'unverified';
    res.json({ status: status });
});

// বট চালু করা
bot.launch().then(() => console.log("Telegram Bot Backend is Running..."));
// -------------------------------------------------------------

// Serve Static Files from Root Directory
app.use(express.static(__dirname));

// Connect Database
if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.error('MongoDB Connection Error:', err));
}

// Serve index.html from Root
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
