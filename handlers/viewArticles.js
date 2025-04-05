const { db } = require('../database');

module.exports = (bot) => {
  // Команда для просмотра статей (только модератору)
  bot.command('articles', async (ctx) => {
    if (!ctx.isModerator) return;

    const articles = db.get('articles').value();
    
    const keyboard = articles.map(article => ([{
      text: `${article.title} - ${article.status}`,
      callback_data: `view_${article.id}`
    }]));

    await ctx.reply('📂 Список статей:', {
      reply_markup: { inline_keyboard: keyboard }
    });
  });

  // Просмотр деталей статьи
  bot.action(/^view_(\d+)$/, async (ctx) => {
    const articleId = parseInt(ctx.match[1]);
    const article = db.get('articles').find({ id: articleId }).value();

    await ctx.editMessageText(
      `📄 *${article.title}*\n\n` +
      `🔗 ${article.url}\n` +
      `👤 @${article.user.username}\n` +
      `Статус: ${article.status}`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Одобрить', callback_data: `approve_${articleId}` },
              { text: '❌ Отклонить', callback_data: `reject_${articleId}` }
            ]
          ]
        }
      }
    );
  });
};