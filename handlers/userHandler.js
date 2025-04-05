const { articles, logs } = require('../database'); // Исправленный импорт
const { moderatorId } = require('../config');

module.exports = (bot) => {
  bot.on('text', async (ctx) => {
    const [title, url] = ctx.message.text.split('\n');
    
    if (!title || !url) {
      return ctx.reply('❌ Неверный формат. Пример:\nМоя статья\nhttps://docs.google.com/...');
    }

    const newArticle = {
      id: Date.now(),
      user: ctx.from,
      title,
      url,
      status: 'pending',
      created_at: new Date().toISOString()
    };

    // Исправленная запись в базу данных
    articles.push(newArticle).write(); // Теперь используем методы lowdb
    
    logs.push({
      type: 'new_article',
      articleId: newArticle.id,
      timestamp: new Date().toISOString()
    }).write();

    // Уведомление модератору
    await ctx.telegram.sendMessage(
      moderatorId,
      `📨 Новая статья:\n\n🏷️ ${title}\n🔗 ${url}\n👤 ${ctx.from.username}`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ Одобрить', callback_data: `approve_${newArticle.id}` },
            { text: '❌ Отклонить', callback_data: `reject_${newArticle.id}` }
          ]]
        }
      }
    );

    ctx.reply('⏳ Статья отправлена на модерацию!');
  });
};