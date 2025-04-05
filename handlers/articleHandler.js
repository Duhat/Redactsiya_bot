const { db } = require('../database');
const { isModerator } = require('../config');

module.exports = (bot) => {
  bot.on('text', async (ctx, next) => {
    const [title, url] = ctx.message.text.split('\n');
    
    // Пропускаем некорректные сообщения
    if (!title || !url) return next();
    
    try {
      // Создание новой статьи
      const newArticle = {
        id: Date.now(),
        user: ctx.from,
        title: title.trim(),
        url: url.trim(),
        status: ctx.isModerator ? 'approved' : 'pending',
        created_at: new Date().toISOString(),
        updated_at: null
      };

      // Сохранение в базу данных
      db.get('articles').push(newArticle).write();

      // Отправка ответа пользователю
      await ctx.reply(
        ctx.isModerator 
          ? '✅ Статья автоматически опубликована!' 
          : '📨 Статья отправлена на модерацию!'
      );

      // Уведомление модератору (если отправил обычный пользователь)
      if (!ctx.isModerator) {
        await ctx.telegram.sendMessage(
          process.env.MODERATOR_ID,
          `📩 *Новая статья на модерацию*\n\n` +
          `🏷️ ${newArticle.title}\n` +
          `🔗 ${newArticle.url}\n` +
          `👤 @${ctx.from.username}`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[
                { text: '✅ Одобрить', callback_data: `approve_${newArticle.id}` },
                { text: '❌ Отклонить', callback_data: `reject_${newArticle.id}` }
              ]]
            }
          }
        );
      }

    } catch (error) {
      console.error('Ошибка при сохранении статьи:', error);
      ctx.reply('⚠️ Произошла ошибка при обработке вашей статьи');
    }
  });
};