const { Telegraf, Markup } = require("telegraf");
require("dotenv").config();
const { setupDB } = require("./db");
const { combinedHandler } = require("./handlers/combined"); // Updated import
const { moderatorHandler } = require("./handlers/moderator");

const BOT_TOKEN = process.env.BOT_TOKEN;
const MODERATOR_ID = parseInt(process.env.MODERATOR_ID);

if (!BOT_TOKEN || isNaN(MODERATOR_ID)) {
  console.error("BOT_TOKEN or MODERATOR_ID не установлены в .env файле");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Initialize database
const db = setupDB();

// Logging middleware
bot.use(async (ctx, next) => {
  console.log(`📨 Received message: ${ctx.message?.text || 'non-text'}`);
  return next();
});

bot.command('start', (ctx) => {
  console.log('✅ /start вызван');
  return ctx.replyWithMarkdown(
    `👋 *Добро пожаловать в редакционный бот!*\n\n` +
    `📌 Чтобы отправить свою готовую статью, используйте команду /submit\n\n` +
    `🎨 Или выберите одну из наших статей и создайте для неё дизайн.\n` +
    `Для выбора статьи используйте команду /design\n\n` +
    `📋 Памятка для дизайнеров: https://www.figma.com/design/w5hRtqFM8wUZKOilbOY7oC/%D1%80%D0%B0%D1%81%D1%81%D0%B2%D0%B5%D1%82-%D0%A2%D0%B8%D0%96?node-id=369-17&t=kGFIgqXGgkWncbUC-0\n\n` +
    `📤 Отправляйте материалы ссылками на облачные хранилища!`
  );
});


// Register handlers in the correct order
moderatorHandler(bot, db, MODERATOR_ID);
combinedHandler(bot, db, MODERATOR_ID); // Use combined handler

bot
  .launch()
  .then(() => console.log("Bot launched"))
  .catch((err) => console.error("Error launching bot:", err));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
