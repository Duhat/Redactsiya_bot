
const { moderatorId } = require('../config');
const { db, getArticlesPage } = require('../database'); // Добавьте db в импорт

const ITEMS_PER_PAGE = 5;

function createArticlesKeyboard(articles, page, totalPages, currentFilter) {
  // Добавим проверку на пустой список
  if (!articles.length) {
    return {
      inline_keyboard: [[{ text: '📭 Список статей пуст', callback_data: 'noop' }]]
    };
  }

  const buttons = articles.map(article => ([
    { 
      text: `${article.status === 'approved' ? '✅' : article.status === 'rejected' ? '❌' : '🕒'} ${article.title}`,
      callback_data: `article_detail_${article.id}`
    }
  ]));

  const navigation = [];
  if (page > 1) {
    navigation.push({ 
      text: '⬅️ Назад', 
      callback_data: `mod_page_${currentFilter}_${page - 1}` 
    });
  }
  if (page < totalPages) {
    navigation.push({ 
      text: 'Вперед ➡️', 
      callback_data: `mod_page_${currentFilter}_${page + 1}` 
    });
  }

  return {
    inline_keyboard: [
      ...buttons,
      navigation.length > 0 ? navigation : [],
      [
        { text: 'Все', callback_data: 'mod_filter_all_1' },
        { text: 'На модерации', callback_data: 'mod_filter_pending_1' },
        { text: 'Одобренные', callback_data: 'mod_filter_approved_1' },
        { text: 'Отклоненные', callback_data: 'mod_filter_rejected_1' }
      ]
    ]
  };
}

module.exports = (bot) => {
    bot.command('moderate', async (ctx) => {
        console.log('[DEBUG] Запрос /moderate от:', ctx.from.id);
        
        if (!ctx.isModerator) {
          console.log('[WARN] Попытка доступа не модератора:', ctx.from.id);
          return ctx.reply('🚫 Доступ запрещен!');
        }
    
        try {
          const result = getArticlesPage(1, ITEMS_PER_PAGE, 'all');
          console.log('[DEBUG] Данные для панели:', result);
          
          await ctx.reply('📂 Панель модератора:', {
            reply_markup: createArticlesKeyboard(
              result.articles, 
              1, 
              result.totalPages, 
              'all'
            )
          });
        } catch (error) {
          console.error('Ошибка в /moderate:', error);
          ctx.reply('⚠️ Ошибка загрузки панели');
        }
      });

  bot.action(/^mod_page_(.+)_(\d+)$/, async (ctx) => {
    const [filter, page] = ctx.match.slice(1);
    try {
      const result = getArticlesPage(parseInt(page), ITEMS_PER_PAGE, filter);
      await ctx.editMessageReplyMarkup(
        createArticlesKeyboard(result.articles, parseInt(page), result.totalPages, filter)
      );
      ctx.answerCbQuery();
    } catch (error) {
      console.error('Pagination error:', error);
      ctx.answerCbQuery('⚠️ Ошибка загрузки');
    }
  });

  bot.action(/^mod_filter_(.+)_(\d+)$/, async (ctx) => {
    const [filter, page] = ctx.match.slice(1);
    try {
      const result = getArticlesPage(parseInt(page), ITEMS_PER_PAGE, filter);
      await ctx.editMessageReplyMarkup(
        createArticlesKeyboard(result.articles, parseInt(page), result.totalPages, filter)
      );
      ctx.answerCbQuery();
    } catch (error) {
      console.error('Filter error:', error);
      ctx.answerCbQuery('⚠️ Ошибка фильтрации');
    }
  });

  bot.action(/^article_detail_(\d+)$/, async (ctx) => {
    const articleId = parseInt(ctx.match[1]);
    try {
      const article = db.get('articles').find({ id: articleId }).value();
      
      const text = [
        `📄 *${article.title}*`,
        `🔗 [Ссылка](${article.url})`,
        `👤 Автор: @${article.user.username}`,
        `📅 Дата: ${new Date(article.created_at).toLocaleDateString()}`,
        `Статус: ${article.status === 'approved' ? '✅ Одобрена' : article.status === 'rejected' ? '❌ Отклонена' : '🕒 На модерации'}`
      ].join('\n');
  
      await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Одобрить', callback_data: `approve_${articleId}` },
              { text: '❌ Отклонить', callback_data: `reject_${articleId}` },
              { 
                text: '👥 Показать дизайны', 
                callback_data: `show_designs_${articleId}`
            }
            ],
            [{ text: '◀️ Назад', callback_data: 'mod_back_to_list' }]
          ]
        }
      });
      ctx.answerCbQuery();
    } catch (error) {
      console.error('Detail error:', error);
      ctx.answerCbQuery('⚠️ Статья не найдена');
    }
  });
  bot.action('mod_back_to_list', async (ctx) => {
    try {
      const result = getArticlesPage(1, ITEMS_PER_PAGE, 'all');
      await ctx.editMessageText('📂 Панель модератора:', {
        reply_markup: createArticlesKeyboard(result.articles, 1, result.totalPages, 'all')
      });
      ctx.answerCbQuery();
    } catch (error) {
      console.error('Back error:', error);
      ctx.answerCbQuery('⚠️ Ошибка загрузки');
    }
  });
  bot.action(/^(approve|reject)_(\d+)$/, async (ctx) => {
    const [action, articleId] = ctx.match.slice(1);
    try {
      db.get('articles')
        .find({ id: parseInt(articleId) })
        .assign({ status: action === 'approve' ? 'approved' : 'rejected' })
        .write();
  
      // Обновляем сообщение
      const article = db.get('articles').find({ id: parseInt(articleId) }).value();
      await ctx.editMessageReplyMarkup({
        inline_keyboard: [
          [
            { 
              text: `✅ Одобрена (обновлено)`, 
              callback_data: `noop`
            }
          ],
          [{ text: '◀️ Назад', callback_data: 'mod_back_to_list' }]
        ]
      });
  
      // Отправляем уведомление автору
      await ctx.telegram.sendMessage(
        article.user.id,
        action === 'approve' 
          ? `✅ Ваша статья "${article.title}" одобрена!` 
          : `❌ Статья "${article.title}" отклонена`
      );
  
      ctx.answerCbQuery(`Статья ${action === 'approve' ? 'одобрена' : 'отклонена'}`);
    } catch (error) {
      console.error('Status change error:', error);
      ctx.answerCbQuery('⚠️ Ошибка обновления');
    }
  });
};