const { Markup } = require("telegraf");

function moderatorHandler(bot, db, MODERATOR_ID) {
    // Главная панель модератора
    bot.command("modpanel", async (ctx) => {
        try {
            if (ctx.from.id !== MODERATOR_ID) {
                return ctx.reply("🚫 Доступ запрещен!");
            }

            const articles = db.get("articles").value();
            
            if (!articles.length) {
                return ctx.reply("📭 Нет статей в базе.");
            }

            const buttons = articles.map(article => [
                Markup.button.callback(
                    `${article.status === 'pending' ? '🕒' : '✅'} ${article.title}`,
                    `article_info_${article.id}`
                )
            ]);

            await ctx.replyWithMarkdown(
                "📚 *Панель модератора*\n\n" +
                "Выберите статью для детальной информации:",
                Markup.inlineKeyboard(buttons)
            );

        } catch (error) {
            console.error("Ошибка в /modpanel:", error);
            ctx.reply("⚠️ Ошибка при загрузке панели.");
        }
    });

    // Просмотр информации о статье
    bot.action(/article_info_(\d+)/, async (ctx) => {
        try {
            if (ctx.from.id !== MODERATOR_ID) {
                return ctx.answerCbQuery("🚫 Нет прав доступа!", { show_alert: true });
            }

            const articleId = parseInt(ctx.match[1]);
            const article = db.get("articles").find({ id: articleId }).value();
            
            if (!article) {
                return ctx.answerCbQuery("❌ Статья не найдена!", { show_alert: true });
            }

            // Получаем связанные дизайны
            const designs = db.get("designs")
                .filter({ articleId: articleId })
                .value();

            await ctx.editMessageText(
                `📌 *Детали статьи:*\n\n` +
                `🆔 ID: ${article.id}\n` +
                `📝 Заголовок: ${article.title}\n` +
                `📄 Описание: ${article.description}\n` +
                `🔗 Ссылка: ${article.link}\n` +
                `📅 Дата создания: ${new Date(article.createdAt).toLocaleString()}\n` +
                `📊 Статус: ${article.status}\n\n` +
                `🎨 Связанные дизайны (${designs.length}):\n` +
                designs.map(d => `▫️ ${d.status} | ${new Date(d.createdAt).toLocaleDateString()}`).join('\n'),
                {
                    parse_mode: "Markdown",
                    reply_markup: Markup.inlineKeyboard([
                        [
                            Markup.button.callback('❌ Удалить', `delete_article_${article.id}`),
                            Markup.button.callback('📝 Статус', `change_status_${article.id}`)
                        ],
                        [Markup.button.callback('🔙 Назад', 'modpanel')]
                    ]).reply_markup
                }
            );

            await ctx.answerCbQuery();

        } catch (error) {
            console.error("Ошибка при просмотре статьи:", error);
            ctx.answerCbQuery("⚠️ Ошибка загрузки данных!");
        }
    });

    // Меню изменения статуса
    bot.action(/change_status_(\d+)/, async (ctx) => {
        try {
            const articleId = parseInt(ctx.match[1]);
            
            await ctx.editMessageReplyMarkup(
                Markup.inlineKeyboard([
                    [
                        Markup.button.callback('✅ Одобрить', `set_status_approved_${articleId}`),
                        Markup.button.callback('🕒 В ожидании', `set_status_pending_${articleId}`)
                    ],
                    [
                        Markup.button.callback('❌ Отклонить', `set_status_rejected_${articleId}`),
                        Markup.button.callback('🔙 Назад', `article_info_${articleId}`)
                    ]
                ])
            );

            await ctx.answerCbQuery();

        } catch (error) {
            console.error("Ошибка при изменении статуса:", error);
            ctx.answerCbQuery("⚠️ Ошибка меню статусов!");
        }
    });

    // Обработчики статусов
    bot.action(/set_status_(approved|pending|rejected)_(\d+)/, async (ctx) => {
        try {
            const status = ctx.match[1];
            const articleId = parseInt(ctx.match[2]);

            db.get("articles")
                .find({ id: articleId })
                .assign({ status: status })
                .write();

            await ctx.answerCbQuery(`✅ Статус изменен на "${status}"`);
            ctx.editMessageText(
                ctx.update.callback_query.message.text + `\n\n🔄 *Новый статус:* ${status}`,
                { parse_mode: "Markdown" }
            );

        } catch (error) {
            console.error("Ошибка изменения статуса:", error);
            ctx.answerCbQuery("⚠️ Ошибка обновления статуса!");
        }
    });

    // Удаление статьи
    bot.action(/delete_article_(\d+)/, async (ctx) => {
        try {
            const articleId = parseInt(ctx.match[1]);
            
            // Удаляем статью и связанные дизайны
            db.get("articles").remove({ id: articleId }).write();
            db.get("designs").remove({ articleId: articleId }).write();

            await ctx.editMessageText(`❌ Статья #${articleId} и связанные дизайны удалены!`);
            await ctx.answerCbQuery();

        } catch (error) {
            console.error("Ошибка при удалении статьи:", error);
            ctx.answerCbQuery("⚠️ Ошибка удаления!");
        }
    });

    // Кнопка "Назад"
    bot.action('modpanel', async (ctx) => {
        try {
            const articles = db.get("articles").value();
            
            const buttons = articles.map(article => [
                Markup.button.callback(
                    `${article.status === 'pending' ? '🕒' : '✅'} ${article.title}`,
                    `article_info_${article.id}`
                )
            ]);

            await ctx.editMessageText(
                "📚 Панель модератора",
                Markup.inlineKeyboard(buttons)
            );

            await ctx.answerCbQuery();

        } catch (error) {
            console.error("Ошибка возврата:", error);
            ctx.answerCbQuery("⚠️ Ошибка возврата!");
        }
    });
}

module.exports = { moderatorHandler };
