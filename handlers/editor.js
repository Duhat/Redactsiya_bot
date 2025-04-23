const { Markup } = require("telegraf");

function editorHandler(bot, db, MODERATOR_ID) {
  const userStates = {};
  console.log("editor handler loaded");

  bot.command("submit", async (ctx) => {
    console.log("Команда /submit вызвана");
    userStates[ctx.from.id] = {
      step: "waiting_title",
    };
    return await ctx.replyWithMarkdown(
      "📝 *Создание новой статьи*\n\n" + "Введите название статьи:"
    );
  });

  bot.on("text", async (ctx, next) => {
    const text = ctx.message?.text;
    if (!text || text.startsWith('/')) return next();
  
    const userId = ctx.from.id;
    const state = userStates[userId];
    if (!state) return next();
  
    switch (state.step) {
      case "waiting_title":
        state.title = text;
        state.step = "waiting_link";
        return await ctx.replyWithMarkdown(
          "🔗 *Шаг 2 из 3*\n\nОтправьте ссылку на статью в формате:\n\n`https://example.com/article`"
        );
      case "waiting_link":
        if (!text.startsWith("http")) {
          return await ctx.replyWithMarkdown(
            "❌ *Ошибка!*\n\nСсылка должна начинаться с `http://` или `https://`\n\nПопробуйте снова:"
          );
        }
        state.link = text;
        state.step = "waiting_description";
        return await ctx.replyWithMarkdown(
          "📄 *Шаг 3 из 3*\n\nДобавьте краткое описание (максимум 200 символов):"
        );
      case "waiting_description":
        if (text.length > 200) {
          return await ctx.replyWithMarkdown(
            "❌ *Слишком длинное описание!*\n\nМаксимальная длина - 200 символов\n\nСократите текст и отправьте снова:"
          );
        }
        state.description = text;
  
        const newArticle = {
          id: Date.now(),
          title: state.title,
          link: state.link,
          description: state.description,
          status: "pending",
          author: userId,
          createdAt: new Date().toISOString(),
        };
  
        db.get("articles").push(newArticle).write();
  
        await bot.telegram.sendMessage(
          MODERATOR_ID,
          `📝 *Новая статья на модерации!*\n\n` +
            `📌 Заголовок: ${state.title}\n` +
            `🔗 Ссылка: ${state.link}\n` +
            `📄 Описание: ${state.description}`,
          Markup.inlineKeyboard([
            [Markup.button.callback("✅ Одобрить", `approve_${newArticle.id}`)],
            [Markup.button.callback("❌ Отклонить", `reject_${newArticle.id}`)],
          ])
        );
  
        delete userStates[userId];
        return await ctx.replyWithMarkdown(
          "✅ *Статья успешно отправлена!*\n\nМодератор проверит её в ближайшее время"
        );
    }
  });

  bot.action(/approve_(\d+)/, async (ctx) => {
    try {
      if (ctx.from.id !== MODERATOR_ID) {
        await ctx.answerCbQuery("🚫 Нет прав доступа!", {
          show_alert: true,
        });
        return;
      }

      const articleId = parseInt(ctx.match[1]);
      const article = db.get("articles").find({ id: articleId }).value();

      if (!article) {
        await ctx.answerCbQuery("❌ Статья не найдена!", {
          show_alert: true,
        });
        return;
      }

      db.get("articles")
        .find({
          id: articleId,
        })
        .assign({
          status: "approved",
          moderatedAt: new Date().toISOString(),
        })
        .write();

      try {
        await bot.telegram.sendMessage(
          article.author,
          `✅ Ваша статья одобрена!\n\n` +
            `📌 "${article.title}"\n` +
            `🔗 ${article.link}`
        );
      } catch (err) {
        console.error("Не удалось уведомить автора:", err);
      }

      await ctx.editMessageText(
        `✅ Статья одобрена:\n\n` +
          `📌 "${article.title}"\n` +
          `🔗 ${article.link}`,
        {
          parse_mode: "Markdown",
        }
      );

      await ctx.answerCbQuery();
    } catch (err) {
      console.error("Ошибка при одобрении:", err);
      await ctx.answerCbQuery("⚠️ Произошла ошибка!", {
        show_alert: true,
      });
    }
  });

  bot.action(/reject_(\d+)/, async (ctx) => {
    try {
      if (ctx.from.id !== MODERATOR_ID) {
        await ctx.answerCbQuery("🚫 Нет прав доступа!", {
          show_alert: true,
        });
        return;
      }

      const articleId = parseInt(ctx.match[1]);
      const article = db.get("articles").find({ id: articleId }).value();

      if (!article) {
        await ctx.answerCbQuery("❌ Статья не найдена!", {
          show_alert: true,
        });
        return;
      }

      try {
        await bot.telegram.sendMessage(
          article.author,
          `❌ Статья отклонена:\n\n` +
            `📌 "${article.title}"\n` +
            `🔗 ${article.link}\n\n` +
            `Причина: стандартный шаблон отклонения`
        );
      } catch (err) {
        console.error("Не удалось уведомить автора:", err);
      }

      db.get("articles")
        .remove({
          id: articleId,
        })
        .write();

      await ctx.editMessageText(
        `❌ Статья удалена:\n\n` + `📌 "${article.title}"`,
        {
          parse_mode: "Markdown",
        }
      );

      await ctx.answerCbQuery();
    } catch (err) {
      console.error("Ошибка при отклонении:", err);
      await ctx.answerCbQuery("⚠️ Произошла ошибка!", {
        show_alert: true,
      });
    }
  });
}
module.exports = { editorHandler };
