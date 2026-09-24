const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');

// আপনার টেলিগ্রাম বট টোকেন
const TOKEN = "8875784523:AAGZJ-gg5eo8gKBmi3E0nf_YD_jpgLOMoIg";
// টেলিগ্রাম গ্রুপ বা এডমিন চ্যাট আইডি
const ADMIN_CHAT_ID = "-1004469681571";

const bot = new TelegramBot(TOKEN, { polling: true });
const app = express();

app.use(bodyParser.json());
app.use(express.static('public')); // যদি ফ্রন্টএন্ট ফাইল public ফোল্ডারে থাকে

// ডেমো ডাটাবেজ অবজেক্ট (আপনার প্রজেক্ট অনুযায়ী MongoDB বা অন্য ডাটাবেজ এখানে যুক্ত করে নিতে পারেন)
let usersDB = {};

// সঠিকভাবে ইউজার আইডি এক্সট্রাক্ট করার ফাংশন (স্পেস থাকুক বা না থাকুক কাজ করবে)
function extractUserId(text) {
    const cleanText = text
        .replace(/\/approved|\/approve|\/reject|\/block/gi, '')
        .replace(/@HubBD_Bot/gi, '')
        .replace(/[^0-9]/g, '') // শুধু সংখ্যাগুলো রাখবে
        .trim();
    return cleanText;
}

// টেলিগ্রাম বট মেসেজ লিসেনার
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text || '';

    if (text.startsWith('/approved') || text.startsWith('/approve')) {
        const userId = extractUserId(text);

        if (!userId) {
            bot.sendMessage(chatId, `❌ সঠিক ইউজার আইডি দিন। উদাহরণ: \`/approved 7643638811\``, { parse_mode: 'Markdown' });
            return;
        }

        // ডাটাবেজে ইউজারের স্ট্যাটাস active করা
        usersDB[userId] = { status: 'active' };

        // গ্রুপে বা এডমিনকে সফল বার্তা পাঠানো
        bot.sendMessage(chatId, `✅ Account Activated!\nUser ID: ${userId} সফলভাবে একটিভ করা হয়েছে।`);
        
        // চাইলে ইউজারকে সরাসরি টেলিগ্রামেও মেসেজ পাঠাতে পারেন
        try {
            bot.sendMessage(userId, `🎉 অভিনন্দন! আপনার একাউন্ট সফলভাবে একটিভ করা হয়েছে। এখন আপনি কাজ ও টাকা উত্তোলন করতে পারবেন।`);
        } catch (e) {
            console.log("Could not message user directly");
        }
    }
});

// মিনি অ্যাপ থেকে স্ট্যাটাস চেক করার API রুট
app.get('/api/check-status/:userId', (req, res) => {
    const userId = req.params.userId;
    
    // ডাটাবেজ চেক করা
    if (usersDB[userId] && usersDB[userId].status === 'active') {
        res.json({ status: 'active' });
    } else {
        res.json({ status: 'unverified' });
    }
});

// সার্ভার স্টার্ট
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
