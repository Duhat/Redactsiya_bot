const { db } = require('../database');
const { isModerator } = require('../config');

module.exports = (bot) => {
  bot.action(/^(approve|reject)_(\d+)$/, async (ctx) => {
    try {
      // Проверка прав модератора
      if (!isModerator(ctx.from.id)) {
        return ctx.answerCbQuery('🚫 Доступ запрещен!', { show_alert: true });
      }

      const [action, articleId] = ctx.match.slice(1);
      
      // Получаем статью
      const article = db.get('articles').find({ id: parseInt(articleId) }).value();

      // Проверка существования статьи
      if (!article) {
        await ctx.answerCbQuery('❌ Статья не найдена', { show_alert: true });
        return ctx.deleteMessage();
      }

      // Проверка наличия автора
      const user = db.get('users').find({ id: article.userId }).value();
      if (!user) {
        await ctx.answerCbQuery('❌ Автор статьи не найден', { show_alert: true });
        return ctx.deleteMessage();
      }

      // Обновление статуса статьи
      db.get('articles')
        .find({ id: parseInt(articleId) })
        .assign({ 
          status: action === 'approve' ? 'approved' : 'rejected',
          updated_at: new Date().toISOString()
        })
        .write();

      // Уведомление автора (используем проверенный user.id)
      await ctx.telegram.sendMessage(
        user.id, // Теперь безопасный доступ через user
        `Ваша статья "${article.title}" была ` + 
        (action === 'approve' ? '✅ одобрена!' : '❌ отклонена!')
      );

      // Обновление интерфейса модератора
      await ctx.editMessageReplyMarkup({
        inline_keyboard: [[
          { 
            text: action === 'approve' ? '✅ Одобрено' : '❌ Отклонено', 
            callback_data: 'noop' 
          }
        ]]
      });

      ctx.answerCbQuery();

    } catch (error) {
      console.error('Ошибка модерации:', error);
      ctx.answerCbQuery('⚠️ Ошибка обработки запроса');
    }
  });
};