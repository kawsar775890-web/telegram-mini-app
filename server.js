const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { Telegraf, Markup } = require('telegraf');

// ================== এনভায়রনমেন্ট ভেরিয়েবল (Render → Environment ট্যাবে বসাবে) ==================
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = String(process.env.ADMIN_CHAT_ID || '');
const MONGODB_URI = process.env.MONGODB_URI;
const WEBAPP_URL = process.env.WEBAPP_URL || '';                 // যেমন https://onrender.com
const BOT_USERNAME = process.env.BOT_USERNAME || '';              // @ ছাড়া, রেফার লিংক বানাতে লাগবে
const CLIENT_USERNAME = process.env.CLIENT_USERNAME || 'emone0011'; // Help & Support বাটনের জন্য (@ ছাড়া)
const YOUTUBE_TASK_LINK = process.env.YOUTUBE_TASK_LINK
    || 'https://youtube.com';
const ACTIVATION_FEE = Number(process.env.ACTIVATION_FEE || 30);
const REFERRAL_REWARD = Number(process.env.REFERRAL_REWARD || 20);
const MIN_WITHDRAW = Number(process.env.MIN_WITHDRAW || 20);
const PAY_NUMBER = process.env.PAY_NUMBER || '01602725947';
const ADMIN_IDS = (process.env.ADMIN_IDS || '')                  // ঐচ্ছিক: "111,222"
    .split(',').map(s => s.trim()).filter(Boolean);
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN || !ADMIN_CHAT_ID || !MONGODB_URI) {
    console.error('BOT_TOKEN, ADMIN_CHAT_ID এবং MONGODB_URI সেট করা আবশ্যক。');
    process.exit(1);
}

// ================== ডাটাবেস মডেল ==================
const User = mongoose.model('User', new mongoose.Schema({
    tgId: { type: String, unique: true, index: true },
    name: String,
    username: String,
    photoUrl: String,
    status: { type: String, enum: ['pending', 'active', 'blocked'], default: 'pending' },

    balance: { type: Number, default: 0 },
    totalEarned: { type: Number, default: 0 },
    totalWithdrawn: { type: Number, default: 0 },

    referredBy: { type: String, default: null },
    totalReferrals: { type: Number, default: 0 },

    videoTasksAvailable: { type: Number, default: 0 }, // কতগুলো YouTube টাস্ক এখন আনলকড ও জমা দেওয়া যাবে
    justActivated: { type: Boolean, default: false },   // এক্টিভেশনের পর একবার "অভিনন্দন" দেখানোর ফ্ল্যাগ

    joinedAt: { type: Date, default: Date.now }
}, { timestamps: true }));

const Request = mongoose.model('Request', new mongoose.Schema({
    type: { type: String, enum: ['activation', 'withdraw', 'task'], required: true },
    tgId: { type: String, index: true },
    name: String,
    username: String,

    // এখানে unique এবং sparse: true করা হলো যেন ফাঁকা/null ভ্যালুগুলো ডুপ্লিকেট কি এরর না দেয়
    trx: { type: String, unique: true, sparse: true, index: true },             
    method: String,          // withdraw: bKash/Nagad
    number: String,          // withdraw: পেমেন্ট নম্বর
    amount: Number,          // withdraw
    proof: String,           // task: স্ক্রিনশট লিংক/প্রমাণ টেক্সট

    status: { type: String, enum: ['pending', 'approved', 'rejected', 'blocked'], default: 'pending' }
}, { timestamps: true }));

// ================== হেল্পার ==================
const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// Telegram Mini App-এর initData যাচাই (নকল আইডি ঠেকায়)
function verifyInitData(initData) {
    if (!initData) return null;
    const p = new URLSearchParams(initData);
    const hash = p.get('hash');
    if (!hash) return null;
    p.delete('hash');
    const str = [...p.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([k, v]) => `${k}=${v}`)
        .join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const calc = crypto.createHmac('sha256', secret).update(str).digest('hex');
    const a = Buffer.from(calc), b = Buffer.from(hash);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    if (Date.now() / 1000 - Number(p.get('auth_date') || 0) > 86400) return null; // ২৪ ঘণ্টার পুরোনো হলে বাতিল
    let user = null;
    try { user = JSON.parse(p.get('user')); } catch { return null; }
    if (!user || !user.id) return null;
    return { user, startParam: p.get('start_param') || null };
}

async function notify(id, text, extra) {
    try { await bot.telegram.sendMessage(id, text, extra); return true; }
    catch (e) { console.log(`ইউজার ${id}-কে মেসেজ যায়নি:`, e.message); return false; }
}

function userPublicState(u) {
    return {
        status: u.status,
        name: u.name,
        username: u.username,
        tgId: u.tgId,
        joinedAt: u.joinedAt,
        balance: u.balance,
        totalEarned: u.totalEarned,
        totalWithdrawn: u.totalWithdrawn,
        totalReferrals: u.totalReferrals,
        videoTasksAvailable: u.videoTasksAvailable,
        justActivated: u.justActivated,
        activationFee: ACTIVATION_FEE,
        referralReward: REFERRAL_REWARD,
        minWithdraw: MIN_WITHDRAW,
        payNumber: PAY_NUMBER,
        youtubeLink: YOUTUBE_TASK_LINK,
        clientUsername: CLIENT_USERNAME,
        botUsername: BOT_USERNAME
    };
}

// ================== বট ==================
const bot = new Telegraf(BOT_TOKEN);

function isAdminGroup(ctx) { return String(ctx.chat.id) === ADMIN_CHAT_ID; }
function isAllowedAdmin(ctx) { return !ADMIN_IDS.length || ADMIN_IDS.includes(String(ctx.from.id)); }

bot.start(async ctx => {
    if (ctx.chat.type !== 'private') return;
    // ব্যবহারকারী referral লিংক দিয়ে ঢুকলে (t.me/BotUsername?start=রেফারারের_আইডি) সেভ রাখা,
    // যদি Mini App খোলার আগেই বট চ্যাটে এসে থাকে। Mini App নিজে খোলার সময় initData-র start_param থেকেও ধরা হয়।
    const refId = ctx.startPayload && /^\d{5,15}$/.test(ctx.startPayload) ? ctx.startPayload : null;
    if (refId && refId !== String(ctx.from.id)) {
        try {
            await User.findOneAndUpdate(
                { tgId: String(ctx.from.id) },
                { $setOnInsert: { referredBy: refId, name: ctx.from.first_name, username: ctx.from.username || '' } },
                { upsert: true }
            );
        } catch (e) { console.log('start referral সেভ এরর:', e.message); }
    }
    if (!WEBAPP_URL) return ctx.reply('স্বাগতম! Task Hub BD-তে আপনাকে স্বাগতম।');
    return ctx.reply('স্বাগতম! অ্যাপ খুলতে নিচের বাটনে চাপুন 👇',
        Markup.inlineKeyboard([Markup.button.webApp('🚀 Open App', WEBAPP_URL)]));
});

// ---------- অ্যাডমিন গ্রুপে Approved/Reject/Block বাটন ----------
bot.on('callback_query', async ctx => {
    if (!isAdminGroup(ctx) || !isAllowedAdmin(ctx)) return ctx.answerCbQuery();

    const data = ctx.callbackQuery.data || '';
    const m = data.match(/^req:(approve|reject|block):([a-f0-9]{24})$/);
    if (!m) return ctx.answerCbQuery();
    const [, action, reqId] = m;

    const request = await Request.findById(reqId);
    if (!request) return ctx.answerCbQuery('রিকোয়েস্ট খুঁজে পাওয়া যায়নি।');
    if (request.status !== 'pending') return ctx.answerCbQuery('এটা আগেই প্রসেস হয়ে গেছে।');

    const user = await User.findOne({ tgId: request.tgId });
    if (!user) return ctx.answerCbQuery('ইউজার খুঁজে পাওয়া যায়নি।');

    let resultLine = '';

    if (action === 'block') {
        user.status = 'blocked';
        await user.save();
        request.status = 'blocked';
        await request.save();
        await notify(user.tgId, '🚫 আপনার অনৈতিক কাজের জন্য আপনাকে বহিষ্কার করা হলো।');
        resultLine = `🚫 Blocked — User ID: ${request.tgId}`;
    } else if (action === 'reject') {
        request.status = 'rejected';
        await request.save();
        if (request.type === 'activation') {
            await notify(user.tgId, '❌ আপনার অ্যাক্টিভেশন অনুরোধ প্রত্যাখ্যান করা হয়েছে। সঠিক তথ্য দিয়ে আবার চেষ্টা করুন।');
        } else if (request.type === 'withdraw') {
            user.balance += request.amount; // রিজার্ভ করা ব্যালেন্স ফেরত
            await user.save();
            await notify(user.tgId, `❌ আপনার ৳${request.amount} উত্তোলনের অনুরোধ প্রত্যাখ্যান করা হয়েছে, ব্যালেন্স ফেরত দেওয়া হয়েছে।`);
        } else if (request.type === 'task') {
            user.videoTasksAvailable += 1; // আবার চেষ্টা করার সুযোগ ফেরত
            await user.save();
            await notify(user.tgId, '❌ আপনার জমা দেওয়া কাজ গ্রহনযোগ্য নয়।');
        }
        resultLine = `🔴 Rejected — User ID: ${request.tgId}`;
    } else if (action === 'approve') {
        request.status = 'approved';
        await request.save();

        if (request.type === 'activation') {
            user.status = 'active';
            user.justActivated = true;
            await user.save();
            await notify(user.tgId, '🎉 অভিনন্দন! আপনার একাউন্টটি সফলভাবে অ্যাক্টিভ করা হয়েছে। এখন আপনি সম্পূর্ণ অ্যাপ ব্যবহার করতে পারবেন।');

            // যে রেফার করেছিল তাকে YouTube টাস্ক আনলক করে দেওয়া
            if (user.referredBy) {
                const referrer = await User.findOne({ tgId: user.referredBy });
                if (referrer) {
                    referrer.totalReferrals += 1;
                    referrer.videoTasksAvailable += 1;
                    await referrer.save();
                    await notify(referrer.tgId, '🎁 আপনার রেফার করা একজন ইউজার অ্যাক্টিভ হয়েছে! এখন Earn ট্যাবে গিয়ে ভিডিও টাস্ক সম্পন্ন করে ৳' + REFERRAL_REWARD + ' নিন।');
                }
            }
        } else if (request.type === 'withdraw') {
            user.totalWithdrawn += request.amount;
            await user.save();
            await notify(user.tgId, `✅ আপনার ৳${request.amount} উত্তোলনের অনুরোধ সফল হয়েছে। কিছু সময়ের মধ্যে পেমেন্ট পেয়ে যাবেন, ধন্যবাদ।`);
        } else if (request.type === 'task') {
            user.balance += REFERRAL_REWARD;
            user.totalEarned += REFERRAL_REWARD;
            await user.save();
            await notify(user.tgId, `🎉 আপনার কাজ সম্পন্ন হয়েছে, আপনি পেয়েছেন ৳${REFERRAL_REWARD}!`);
        }
        resultLine = `✅ Approved — User ID: ${request.tgId}`;
