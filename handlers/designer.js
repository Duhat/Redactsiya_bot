const { Markup } = require("telegraf");

function designerHandler(bot, db) {
    const userStates = {};
    console.log("🛠️ Designer handler загружен");

    // Основная команда /design
    bot.command('design', async (ctx) => {
        try {
            const userId = ctx.from.id;
            
            // Проверка активной сессии
            if (userStates[userId]) {
                const currentArticle = db.get('articles')
                    .find({ id: userStates[userId].articleId })
                    .value();
                    
                return ctx.replyWithMarkdown(
                    `🚫 *У вас уже есть активная сессия!*\n\n` +
                    `📌 Текущая статья: "${currentArticle.title}"\n` +
                    `🔗 Ссылка: ${currentArticle.link}\n\n` +
                    `Завершите текущий дизайн или отмените командой /cancel`
                );
            }

            const articles = db.get('articles')
                .filter({ status: 'approved' })
                .value();

            if (!articles.length) {
                return ctx.replyWithMarkdown(
                    '📭 *Нет статей для дизайна!*\n' +
                    'Все статьи уже в работе или ожидают модерации.'
                );
            }

            // Получаем количество дизайнеров для каждой статьи
            const articleCounts = db.get('designs')
                .filter({ status: 'pending' })
                .groupBy('articleId')
                .map((designs, articleId) => ({ articleId, count: designs.length }))
                .keyBy('articleId')
                .value();

            const buttons = articles.map(article => {
                const count = articleCounts[article.id]?.count || 0;
                return [
                    Markup.button.callback(
                        `📌 ${article.title.slice(0, 40)} ( дизайнеров: ${count} )`,
                        `select_article_${article.id}`
                    )
                ];
            });

            await ctx.replyWithMarkdown(
                '📚 *Доступные статьи:*\n' +
                'Выберите статью для дизайна:',
                Markup.inlineKeyboard(buttons)
            );

        } catch (error) {
            console.error('Ошибка в /design:', error);
            ctx.reply('⚠️ Ошибка при загрузке статей');
        }
    });

    // Команда отмены
    bot.command('cancel', async (ctx) => {
        const userId = ctx.from.id;
        if (userStates[userId]) {
            delete userStates[userId];
            return ctx.reply('✅ Текущая сессия отменена');
        }
        return ctx.reply('⚠️ Нет активных сессий для отмены');
    });

    // Выбор статьи
    bot.action(/select_article_(\d+)/, async (ctx) => {
        try {
            const userId = ctx.from.id;
            
            if (userStates[userId]) {
                return ctx.answerCbQuery('🚫 Завершите текущую сессию!', { show_alert: true });
            }

            const articleId = parseInt(ctx.match[1]);
            const article = db.get("articles")
                .find({ id: articleId, status: "approved" })
                .value();

            if (!article) {
                await ctx.answerCbQuery("❌ Статья недоступна!", { show_alert: true });
                return;
            }

            // Сохраняем предварительный выбор
            userStates[userId] = {
                articleId: articleId,
                step: "confirm_article",
                timestamp: Date.now()
            };

            // Отправляем описание для подтверждения
            await ctx.replyWithMarkdown(
                `📚 *Описание статьи:*\n\n` +
                `📌 *Заголовок:* ${article.title}\n` +
                `📄 *Описание:*\n${article.description}\n\n` +
                `🔗 *Ссылка на статью будет доступна после подтверждения*`,
                Markup.inlineKeyboard([
                    [
                        Markup.button.callback('✅ Подтвердить', `confirm_article_${articleId}`),
                        Markup.button.callback('❌ Отклонить', 'reject_article')
                    ]
                ])
            );
            
            await ctx.answerCbQuery();
            
        } catch (error) {
            console.error("Ошибка при выборе статьи:", error);
            ctx.reply("⚠️ Ошибка! Не удалось обработать ваш выбор");
        }
    });

    // Подтверждение статьи
    bot.action(/confirm_article_(\d+)/, async (ctx) => {
        try {
            const userId = ctx.from.id;
            const articleId = parseInt(ctx.match[1]);
            
            const session = userStates[userId];
            if (!session || session.articleId !== articleId) {
                return ctx.answerCbQuery('🚫 Сессия устарела!', { show_alert: true });
            }

            const article = db.get("articles")
                .find({ id: articleId })
                .value();

            // Обновляем состояние
            session.step = "waiting_design_url";
            session.attempts = 3;

            await ctx.editMessageText(
                `📌 *Статья подтверждена:* ${article.title}\n\n` +
                `🔗 *Ссылка на статью:* ${article.link}\n\n` +
                `🌐 Теперь отправьте ссылку на дизайн:`,
                { parse_mode: "Markdown" }
            );

            await ctx.answerCbQuery();
            
        } catch (error) {
            console.error("Ошибка подтверждения:", error);
            ctx.reply("⚠️ Ошибка! Не удалось подтвердить выбор");
        }
    });

    // Отклонение статьи
    bot.action('reject_article', async (ctx) => {
        try {
            const userId = ctx.from.id;
            
            if (userStates[userId]) {
                delete userStates[userId];
                await ctx.editMessageText('❌ Вы отклонили статью');
                await ctx.answerCbQuery();
                return ctx.replyWithMarkdown(
                    '🔄 Вы можете выбрать другую статью командой /design'
                );
            }
            
            await ctx.answerCbQuery('🚫 Нет активной сессии!', { show_alert: true });
            
        } catch (error) {
            console.error("Ошибка отклонения:", error);
            ctx.reply("⚠️ Ошибка! Не удалось обработать отклонение");
        }
    });

    // Обработчик ссылок
    bot.on('text', async (ctx) => {
        try {
            const userId = ctx.from.id;
            const session = userStates[userId];
            
            if (!session || session.step !== "waiting_design_url") return;

            // Проверка формата ссылки
            if (!/^(https?:\/\/)[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(ctx.message.text)) {
                session.attempts--;
                
                if (session.attempts > 0) {
                    return ctx.replyWithMarkdown(
                        `❌ *Некорректная ссылка!*\n` +
                        `Осталось попыток: ${session.attempts}\n\n` +
                        "Пример правильного формата:\n" +
                        "`https://drive.google.com/file/design.pdf`"
                    );
                }
                
                delete userStates[userId];
                return ctx.reply("🚫 Превышено количество попыток. Начните заново /design");
            }

            // Проверка существующего дизайна
            const existingDesign = db.get("designs")
                .find({ 
                    articleId: session.articleId,
                    designerId: userId,
                    status: "pending"
                })
                .value();
                
            if (existingDesign) {
                return ctx.replyWithMarkdown(
                    `⚠️ *Уже есть активный дизайн!*\n\n` +
                    `🔗 Текущая ссылка: ${existingDesign.designUrl}\n\n` +
                    `Дождитесь модерации или отмените текущую сессию /cancel`
                );
            }

            // Сохранение дизайна
            db.get("designs").push({
                id: Date.now(),
                articleId: session.articleId,
                designerId: userId,
                designUrl: ctx.message.text,
                status: "pending",
                createdAt: new Date().toISOString()
            }).write();

            // Уведомление модератору
            const article = db.get("articles").find({ id: session.articleId }).value();
            const MODERATOR_ID = process.env.MODERATOR_ID;
            
            await bot.telegram.sendMessage(
                MODERATOR_ID,
                `🎨 *Новый дизайн для статьи:*\n\n` +
                `📌 ${article.title}\n` +
                `👤 Дизайнер: @${ctx.from.username || 'без username'}\n` +
                `🔗 Ссылка: ${ctx.message.text}`,
                { parse_mode: "Markdown" }
            );

            delete userStates[userId];
            
            // Подтверждение пользователю
            await ctx.replyWithMarkdown(
                "✅ *Дизайн успешно отправлен!*\n\n" +
                "Модератор проверит вашу работу в ближайшее время\n\n" +
                "Для нового дизайна используйте /design"
            );

        } catch (error) {
            console.error("Ошибка обработки дизайна:", error);
            ctx.reply("⚠️ Критическая ошибка! Сообщите администратору");
        }
    });
}

module.exports = { designerHandler };
 