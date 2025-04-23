const { Telegraf } = require("telegraf");
require("dotenv").config();
const { setupDB } = require("./db");
const { editorHandler } = require("./handlers/editor");
const { designerHandler } = require("./handlers/designer");
const { moderatorHandler } = require("./handlers/moderator");

const BOT_TOKEN = process.env.BOT_TOKEN;
const MODERATOR_ID = parseInt(process.env.MODERATOR_ID);

if (!BOT_TOKEN || isNaN(MODERATOR_ID)) {
  console.error("BOT_TOKEN or MODERATOR_ID не установлены в .env файле");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Инициализация базы данных
const db = setupDB();

// Обработчики
bot.use(async (ctx, next) => {
    console.log(`📨 Получено сообщение: ${ctx.message?.text || 'не текст'}`);
    return next();
});

bot.command('start', (ctx) => {
    console.log('✅ /start вызван');
  return ctx.replyWithMarkdown(
    `👋 *Добро пожаловать в бот редакции!*\n\n` +
      `📌 Ты можешь отправить свою готовую статью\n` +
      `Отправьте /submit чтобы добавить новую статью\n\n` +
      `🎨 Или выбрать одну из наших статей и сделать для нее дизайн\n` +
      `Используйте /design для выбора статьи\n\n` +
      `Памятка для дизайнеров: https://www.figma.com/design/w5hRtqFM8wUZKOilbOY7oC/%D1%80%D0%B0%D1%81%D1%81%D0%B2%D0%B5%D1%82-%D0%A2%D0%B8%D0%96?node-id=369-17&t=kGFIgqXGgkWncbUC-0\n\n`+
      `Отправляй материалы ссылками на облачные хранилища!`
  );
});




// Подключаем обработчики В ПРАВИЛЬНОМ ПОРЯДКЕ:
// 1. Сначала команды с высоким приоритетом
moderatorHandler(bot, db, MODERATOR_ID);  // Команды модератора
designerHandler(bot, db);                 // Команда /design

// 2. Потом общий текст (editorHandler)
editorHandler(bot, db, MODERATOR_ID);     // Обработчик текста — последним

bot
  .launch()
  .then(() => console.log("Бот запущен"))
  .catch((err) => console.error("Ошибка запуска бота:", err));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
