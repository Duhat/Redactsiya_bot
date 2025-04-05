const { db } = require('../database');
const { isModerator } = require('../config');
const { Design, Article, User } = require('../database/models');
const crypto = require('crypto');

const DESIGN_TIMEOUT = 604800000;

function generateSecureLink(article) {
    return `${article.url}?token=${crypto.randomBytes(16).toString('hex')}`;
}

module.exports = (bot) => {
    // Показать доступные статьи с конкурсом
    bot.command('available_articles', async (ctx) => {
        try {
            const user = db.get('users').find({ id: ctx.from.id }).value();
            if (user?.blockedUntil && user.blockedUntil > Date.now()) {
                return ctx.reply('🚫 Ваш аккаунт временно заблокирован!');
            }
    
            const articles = db.get('articles')
                .filter({ status: 'approved' })
                .value();
    
            if (!articles.length) {
                return ctx.reply('📭 Нет доступных статей для дизайна');
            }
    
            // Добавляем счетчик активных дизайнеров
            const articlesWithStats = articles.map(article => {
                const activeDesigners = db.get('designs')
                    .filter({ 
                        articleId: article.id, 
                        status: 'pending' 
                    })
                    .size()
                    .value();
                return { ...article, activeDesigners };
            });
    
            // Формируем вертикальные кнопки
            const inlineKeyboard = articlesWithStats.map(article => [
                {
                    text: `${article.title} (👥 ${article.activeDesigners})`,
                    callback_data: `select_article_${article.id}`
                }
            ]);
    
            // // Добавляем кнопку обновления в конец
            // inlineKeyboard.push([
            //     { 
            //         text: "🔄 Обновить список", 
            //         callback_data: "refresh_articles" 
            //     }
            // ]);
    
            // Отправляем сообщение с пояснением
            await ctx.replyWithMarkdown(
                `🎨 *Доступные статьи для дизайна*\n` +
                `_Цифры показывают количество дизайнеров, работающих над статьей_`,
                {
                    reply_markup: {
                        inline_keyboard: inlineKeyboard
                    }
                }
            );
    
        } catch (error) {
            console.error('Ошибка:', error);
            ctx.reply('⚠️ Не удалось загрузить список статей');
        }
    });

    // Выбор статьи (без проверки на занятость)
    bot.action(/^select_article_(\d+)$/, async (ctx) => {
        try {
            if (!ctx.session) ctx.session = {};
            const articleId = parseInt(ctx.match[1]);
            const article = db.get('articles').find({ id: articleId }).value();

            if (!article || article.status !== 'approved') {
                return ctx.answerCbQuery('❌ Статья недоступна', { show_alert: true });
            }

            ctx.session = {
                selectedArticleId: articleId,
                accessToken: generateSecureLink(article),
                timestamp: Date.now()
            };

            await ctx.replyWithMarkdown(
                `🔒 *${article.title}*\n📝 Ссылка: \`${ctx.session.accessToken}\`\n⬇️ Отправьте дизайн в течение недели`
            );

        } catch (error) {
            console.error('Ошибка выбора:', error);
            ctx.answerCbQuery('⚠️ Ошибка');
        }
    });

    // Обработка дизайна
    bot.on(['photo', 'document', 'text'], async (ctx) => {
        try {
            if (ctx.message.text?.startsWith('/')) return;
            if (!ctx.session?.selectedArticleId) {
                return ctx.reply('❌ Сначала выберите статью');
            }

            // Тайм-аут
            if (Date.now() - ctx.session.timestamp > DESIGN_TIMEOUT) {
                delete ctx.session;
                return ctx.reply('⌛ Время вышло!');
            }

            // Получение файла
            let fileUrl;
            if (ctx.message.photo) {
                fileUrl = await ctx.telegram.getFileLink(ctx.message.photo[0].file_id);
            } else if (ctx.message.document) {
                fileUrl = await ctx.telegram.getFileLink(ctx.message.document.file_id);
            } else if (ctx.message.text?.startsWith('http')) {
                fileUrl = ctx.message.text;
            } else {
                return ctx.reply('❌ Некорректный формат');
            }

            // Сохранение дизайна
            const newDesign = {
                id: Date.now(),
                articleId: ctx.session.selectedArticleId,
                designerId: ctx.from.id,
                fileUrl,
                status: 'pending',
                createdAt: Date.now(),
                reviewedAt: null
            };
            db.get('designs').push(newDesign).write();

            // Статистика для уведомления
            const activeDesigners = db.get('designs')
                .filter({ articleId: newDesign.articleId, status: 'pending' })
                .size()
                .value();

            // Уведомление модератору (без кнопок)
            await ctx.telegram.sendMessage(
                process.env.MODERATOR_ID,
                `🎨 *Новый дизайн*\n\n` +
                `📝 Статья: ${db.get('articles').find({ id: newDesign.articleId }).value().title}\n` +
                `👤 Автор: @${ctx.from.username}\n` +
                `🔗 Ресурс: ${fileUrl}\n` +
                `👥 Конкуренция: ${activeDesigners} дизайнеров`,
                { parse_mode: 'Markdown' }
            );

            await ctx.reply('✅ Дизайн отправлен! Конкуренция: ' + activeDesigners);
            delete ctx.session;

        } catch (error) {
            console.error('Ошибка:', error);
            ctx.reply('⚠️ Ошибка обработки');
        }
    });

    // Управление заданиями
    bot.command('my_designs', async (ctx) => {
        try {
            // Автоматическая отмена старых заданий
            const expiredDesigns = db.get('designs')
                .filter({
                    designerId: ctx.from.id,
                    status: 'pending'
                })
                .filter(d => Date.now() - d.createdAt > DESIGN_TIMEOUT)
                .value();

            expiredDesigns.forEach(d => {
                db.get('designs').remove({ id: d.id }).write();
            });

            // Основная логика
            const designs = db.get('designs')
                .filter({ designerId: ctx.from.id })
                .value();

            if (!designs.length) {
                return ctx.reply('📭 У вас нет активных заданий');
            }

            const buttons = designs.map(d => ({
                text: `${d.status === 'pending' ? '🕒' : '❌'} Задание #${d.id}`,
                callback_data: `design_${d.id}`
            }));

            await ctx.reply('📂 Ваши задания:', {
                reply_markup: { inline_keyboard: [buttons] }
            });

        } catch (error) {
            console.error('Ошибка:', error);
            ctx.reply('⚠️ Ошибка загрузки заданий');
        }
    });

    // Просмотр деталей задания
    bot.action(/^design_(\d+)$/, async (ctx) => {
        const design = db.get('designs').find({ id: parseInt(ctx.match[1]) }).value();
        const article = db.get('articles').find({ id: design.articleId }).value();

        await ctx.replyWithMarkdown(
            `*Статус:* ${design.status}\n` +
            `*Статья:* ${article.title}\n` +
            `*Ссылка:* ${design.fileUrl}\n` +
            `*Создано:* ${new Date(design.createdAt).toLocaleString()}\n` +
            `${design.reviewedAt ? `*Проверено:* ${new Date(design.reviewedAt).toLocaleString()}\n` : ''}` +
            `${design.status === 'rejected' ? '🛠️ Исправьте и отправьте заново' : ''}`
        );
    });
};