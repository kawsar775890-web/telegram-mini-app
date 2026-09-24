const express = require('express');
const path = require('path');
const { Telegraf } = require('telegraf');

const app = express();
app.use(express.json());

const BOT_TOKEN = '8875784523:AAGZJ-gg5eo8gKBmi3E0nf_YD_jpgLOMoIg';
const bot = new Telegraf(BOT_TOKEN);

// মেমোরিতে ইউজার স্ট্যাটাস সেভ রাখার অবজেক্ট
const userStatusMap = {};

// খুব নিখুঁতভাবে ইউজার আইডি এক্সট্রাক্ট করার ফাংশন
function extractUserId(text) {
    // টেক্সট থেকে সকল অক্ষর, স্ল্যাশ এবং স্পেস বাদ দিয়ে শুধু সংখ্যাগুলো আলাদা করবে
    const matches = text.match(/\d+/g);
    if (matches && matches.length > 0) {
        // সাধারণত কমান্ডের পরের সংখ্যাটিই ইউজার আইডি হবে
        return matches[matches.length - 1];
    }
    return null;
}

// বট মেসেজ হ্যান্ডলার
bot.on('text', async (ctx) => {
    const text = ctx.message.text ? ctx.message.text.trim() : '';

    // /approved বা /approve কমান্ড চেক
    if (text.toLowerCase().includes('/approved') || text.toLowerCase().includes('/approve')) {
        const userId = extractUserId(text);

        if (userId) {
            // স্ট্যাটাস একটিভ করে দিলাম
            userStatusMap[userId] = 'active';
            console.log(`User Activated Successfully -> ID: ${userId}`); // সার্ভার কনসোলে দেখার জন্য

            await ctx.reply(`✅ <b>Account Activated!</b>\nUser ID: <code>${userId}</code> সফলভাবে অ্যাক্টিভ করা হয়েছে।`, { parse_mode: 'HTML' });

            bot.telegram.sendMessage(userId, "🎉 <b>অভিনন্দন!</b> আপনার একাউন্টটি সফলভাবে অ্যাক্টিভ করা হয়েছে। এখন আপনি কাজ ও টাকা উত্তোলন করতে পারবেন।", { parse_mode: 'HTML' })
            .catch(err => console.log("User DM Error:", err));
        } else {
            await ctx.reply("❌ ইউজার আইডি পাওয়া যায়নি! সঠিকভাবে লিখুন, যেমন: `/approved 7643638811`", { parse_mode: 'HTML' });
        }
    }

    // /reject কমান্ড চেক
    else if (text.toLowerCase().includes('/reject')) {
        const userId = extractUserId(text);
        if (userId) {
            userStatusMap[userId] = 'rejected';
            await ctx.reply(`❌ <b>Request Rejected!</b>\nUser ID: <code>${userId}</code>-এর রিকোয়েস্ট বাতিল করা হয়েছে।`, { parse_mode: 'HTML' });
            bot.telegram.sendMessage(userId, "⚠️ <b>রিকোয়েস্ট বাতিল!</b> আপনার প্রদানকৃত তথ্য সঠিক ছিল না।", { parse_mode: 'HTML' }).catch(e => {});
        }
    }

    // /block কমান্ড চেক
    else if (text.toLowerCase().includes('/block')) {
        const userId = extractUserId(text);
        if (userId) {
            userStatusMap[userId] = 'blocked';
            await ctx.reply(`🚫 <b>User Blocked!</b>\nUser ID: <code>${userId}</code> ব্লক করা হয়েছে।`, { parse_mode: 'HTML' });
            bot.telegram.sendMessage(userId, "🚫 আপনার অ্যাকাউন্ট ব্লক করা হয়েছে।", { parse_mode: 'HTML' }).catch(e => {});
        }
    }
});

// মিনি অ্যাপ থেকে স্ট্যাটাস চেক করার API
app.get('/api/check-status/:userId', (req, res) => {
    const userId = req.params.userId.trim();
    const status = userStatusMap[userId] || 'unverified';
    console.log(`Status Check for ID ${userId}: ${status}`); // ডিবাগ করার জন্য কনসোলে দেখা যাবে
    res.json({ status: status });
});

app.use(express.static(__dirname));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    bot.launch().then(() => console.log("Telegram Bot is Running..."))
      .catch(err => console.log("Bot launch error:", err));
});
