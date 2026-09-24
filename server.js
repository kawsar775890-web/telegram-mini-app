const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { Telegraf, Markup } = require('telegraf');

// ---------- এনভায়রনমেন্ট ভেরিয়েবল (হোস্টিংয়ের Environment ট্যাবে বসাবে) ----------
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = String(process.env.ADMIN_CHAT_ID || '');
const MONGODB_URI = process.env.MONGODB_URI;
const WEBAPP_URL = process.env.WEBAPP_URL || '';          // যেমন https://your-app.onrender.com
const ADMIN_IDS = (process.env.ADMIN_IDS || '')           // ঐচ্ছিক: "111,222" (শুধু এরা কমান্ড দিতে পারবে)
    .split(',').map(s => s.trim()).filter(Boolean);
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN || !ADMIN_CHAT_ID || !MONGODB_URI) {
    console.error('BOT_TOKEN, ADMIN_CHAT_ID এবং MONGODB_URI সেট করা আবশ্যক।');
    process.exit(1);
}

// ---------- ডাটাবেস মডেল ----------
const User = mongoose.model('User', new mongoose.Schema({
    tgId: { type: String, unique: true, index: true },
    status: { type: String, enum: ['unverified', 'active', 'blocked'], default: 'unverified' }
}, { timestamps: true }));

const Trx = mongoose.model('Trx', new mongoose.Schema({
    trx: { type: String, unique: true },   // একই TrxID দুইবার জমা দেওয়া ঠেকাতে
    tgId: String
}, { timestamps: true }));

// ---------- হেল্পার ----------
const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// Mini App-এর initData যাচাই (নকল আইডি ঠেকায়)
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
    try { return JSON.parse(p.get('user')); } catch { return null; }
}

// ---------- বট ----------
const bot = new Telegraf(BOT_TOKEN);

async function notifyUser(id, text) {
    try { await bot.telegram.sendMessage(id, text); return true; }
    catch (e) { console.log(`ইউজার ${id}-কে মেসেজ যায়নি:`, e.message); return false; }
}

bot.start(ctx => {
    if (ctx.chat.type !== 'private') return;
    if (!WEBAPP_URL) return ctx.reply('স্বাগতম! অ্যাপ খুলতে নিচের Start App বাটন ব্যবহার করুন।');
    return ctx.reply('স্বাগতম! অ্যাপ খুলতে নিচের বাটনে চাপুন 👇',
        Markup.inlineKeyboard([Markup.button.webApp('🚀 Open App', WEBAPP_URL)]));
});

// অ্যাডমিন গ্রুপের কমান্ড: /approved 123  /approved123  /reject 123  /block 123
bot.on('text', async ctx => {
    if (String(ctx.chat.id) !== ADMIN_CHAT_ID) return;                          // শুধু অ্যাডমিন গ্রুপ
    if (ADMIN_IDS.length && !ADMIN_IDS.includes(String(ctx.from.id))) return;   // ঐচ্ছিক অ্যাডমিন তালিকা

    const m = ctx.message.text.trim().match(/^\/(approved|reject|block)(?:@\w+)?\s*(\d{5,15})\b/i);
    if (!m) return;
    const cmd = m[1].toLowerCase();
    const id = m[2];

    try {
        if (cmd === 'approved') {
            const before = await User.findOneAndUpdate(
                { tgId: id }, { status: 'active' }, { upsert: true, new: false }
            );
            if (before && before.status === 'active') {
                return ctx.reply(`ℹ️ User ID: ${id} আগে থেকেই অ্যাক্টিভ।`);
            }
            await ctx.reply(`✅ Account Activated!\nUser ID: ${id} সফলভাবে অ্যাক্টিভ করা হয়েছে।`);
            const sent = await notifyUser(id, '🎉 অভিনন্দন! আপনার একাউন্টটি সফলভাবে অ্যাক্টিভ করা হয়েছে। এখন আপনি কাজ ও টাকা উত্তোলন করতে পারবেন।');
            if (!sent) await ctx.reply(`⚠️ ইউজারকে মেসেজ পাঠানো যায়নি (সে হয়তো বট স্টার্ট করেনি), তবে অ্যাকাউন্ট অ্যাক্টিভ হয়েছে।`);
        } else if (cmd === 'reject') {
            await ctx.reply(`❌ User ID: ${id}-এর অনুরোধ রিজেক্ট করা হয়েছে।`);
            await notifyUser(id, '❌ আপনার অনুরোধটি রিজেক্ট করা হয়েছে। সঠিক তথ্য দিয়ে আবার চেষ্টা করুন।');
        } else if (cmd === 'block') {
            await User.findOneAndUpdate({ tgId: id }, { status: 'blocked' }, { upsert: true });
            await ctx.reply(`🚫 User ID: ${id} ব্লক করা হয়েছে।`);
            await notifyUser(id, '🚫 আপনার একাউন্টটি ব্লক করা হয়েছে।');
        }
    } catch (e) {
        console.error('Admin command error:', e);
        ctx.reply('⚠️ কমান্ড প্রসেস করতে সমস্যা হয়েছে, আবার চেষ্টা করুন।');
    }
});

bot.catch((err) => console.error('Bot error:', err));

// ---------- Express সার্ভার ----------
const app = express();
app.use(express.json({ limit: '10kb' }));
app.use(express.static('public')); // index.html থাকবে public ফোল্ডারে

// ১. ইউজারের স্ট্যাটাস (অ্যাপ প্রতি ১৫ সেকেন্ডে এটা কল করে)
app.get('/api/check-status/:id', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const id = req.params.id;
    if (!/^\d{1,15}$/.test(id)) return res.json({ status: 'unverified' });
    try {
        const u = await User.findOne({ tgId: id }).lean();
        res.json({ status: u ? u.status : 'unverified' });
    } catch (e) {
        res.status(500).json({ status: 'error' });
    }
});

// ২. TrxID জমা: অ্যাপ → সার্ভার → অ্যাডমিন গ্রুপ
const lastSubmit = new Map();

app.post('/api/submit-trx', async (req, res) => {
    const tgUser = verifyInitData(req.body.initData);
    if (!tgUser || !tgUser.id) return res.status(403).json({ ok: false, error: 'invalid_user' });

    const trx = String(req.body.trx || '').trim();
    if (!/^[A-Za-z0-9]{6,20}$/.test(trx)) return res.status(400).json({ ok: false, error: 'invalid_trx' });

    const id = String(tgUser.id);

    // স্প্যাম রোধ: একজন ইউজার ৩০ সেকেন্ডে একবার
    const now = Date.now();
    if (now - (lastSubmit.get(id) || 0) < 30000) return res.status(429).json({ ok: false, error: 'too_fast' });
    lastSubmit.set(id, now);

    try {
        const existing = await User.findOne({ tgId: id }).lean();
        if (existing && existing.status === 'active') return res.json({ ok: true, already: true });
        if (existing && existing.status === 'blocked') return res.status(403).json({ ok: false, error: 'blocked' });

        try {
            await Trx.create({ trx: trx.toUpperCase(), tgId: id });
        } catch (e) {
            if (e.code === 11000) return res.status(409).json({ ok: false, error: 'duplicate_trx' });
            throw e;
        }

        const time = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' });
        const text =
            `📥 <b>New Account Activation Request!</b>\n\n` +
            `👤 <b>Name:</b> ${esc(tgUser.first_name)}\n` +
            `🆔 <b>User ID:</b> <code>${id}</code>\n` +
            `🔗 <b>Username:</b> ${tgUser.username ? '@' + esc(tgUser.username) : 'N/A'}\n` +
            `🔢 <b>TrxID:</b> <code>${esc(trx)}</code>\n` +
            `⏰ <b>Time:</b> ${time}\n\n` +
            `অ্যাপ্রুভ: <code>/approved ${id}</code>\n` +
            `রিজেক্ট: <code>/reject ${id}</code>\n` +
            `ব্লক: <code>/block ${id}</code>`;

        await bot.telegram.sendMessage(ADMIN_CHAT_ID, text, { parse_mode: 'HTML' });
        res.json({ ok: true });
    } catch (e) {
        console.error('submit-trx error:', e);
        res.status(500).json({ ok: false, error: 'server_error' });
    }
});

// ---------- চালু করা ----------
(async () => {
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB connected');

    app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));

    bot.launch({ dropPendingUpdates: true }).catch(e => {
        console.error('Bot launch failed:', e.message);
    });
    console.log('Bot started');
})().catch(e => {
    console.error('Startup failed:', e);
    process.exit(1);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
