const { Telegraf, session } = require('telegraf');
const { botToken } = require('./config');
const authMiddleware = require('./middlewares/auth');
const articleHandler = require('./handlers/articleHandler');
const moderationHandler = require('./handlers/moderationHandler');
const moderationPanel = require('./handlers/moderationPanel');
const designHandler = require('./handlers/designHandler');
const adminHandler = require('./handlers/adminHandler');

// Инициализация бота
const bot = new Telegraf(process.env.BOT_TOKEN);

//const session = require('telegraf/session');
bot.use(session({
    defaultSession: () => ({}), // Добавьте это
    getSessionKey: (ctx) => ctx.from?.id.toString()
  }));

// Middleware
bot.use(authMiddleware);bot.start((ctx) => {
  ctx.replyWithMarkdown(`
🎉 *Добро пожаловать в редакцию\!* 

*Здесь вы можете:*
✨ Отправить текстовый материал
🎨 Создать дизайн для наших статей

—————————————————
*📝 Как отправить статью?*
Просто напишите сообщение в формате:
\`\`\`
Название статьи
Ссылка на материал
\`\`\`
_Пример:_
\`\`\`
Как приготовить вкусные печеньки
https://www.vkusnyblog.com/menu/retsepty-pechenya/
\`\`\`

—————————————————
*🖌️ Как работать с дизайном?*
1 Выберите статью: /available\\_articles
2 Получите уникальную ссылку
3 Отправьте готовый дизайн \\(фото, документ или ссылку\\)
4 Ждите одобрения модератора

—————————————————
*📌 Важно\!*
• Все материалы проверяются модератором
• Аккаунт должен быть активным
• Срок выполнения дизайна — 7 дней
• Ссылка на Ваш аккаунт сохраняется в редакции
• Ваши работы можно посмотреть: /my\\_designs

  `);
});

// Подключение обработчиков
articleHandler(bot);
moderationHandler(bot);
moderationPanel(bot);
designHandler(bot);
adminHandler(bot);

// Базовые команды


// Обработка ошибок
bot.catch((err, ctx) => {
  console.error(`Ошибка в чате ${ctx.chat?.id}:`, err);
});

// Запуск бота
bot.launch()
  .then(() => console.log('🤖 Бот успешно запущен'))
  .catch((err) => console.error('Ошибка запуска:', err));