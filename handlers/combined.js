const { Markup } = require("telegraf");

function combinedHandler(bot, db, MODERATOR_ID) {
  const userStates = {}; // для отслеживания состояния пользователей (редактор и дизайнер)

  console.log("combined handler loaded");

  // --- РЕДАКТОР: Отправка статьи через /submit ---
  bot.command("submit", async (ctx) => {
    userStates[ctx.from.id] = { step: "waiting_title" };
    return ctx.replyWithMarkdown(
      "📝 *Создание новой статьи*\n\nВведите название статьи:"
    );
  });

  bot.on("text", async (ctx, next) => {
    const text = ctx.message?.text;
    if (!text) return next();

    const userId = ctx.from.id;
    const state = userStates[userId];

    // Если пользователь в процессе отправки статьи
    if (state && state.step && ["waiting_title", "waiting_link", "waiting_description"].includes(state.step)) {
      switch (state.step) {
        case "waiting_title":
          state.title = text;
          state.step = "waiting_link";
          return ctx.replyWithMarkdown(
            "🔗 *Шаг 2 из 3*\n\nОтправьте ссылку на статью в формате:\n\n`https://example.com/article`"
          );

        case "waiting_link":
          if (!text.startsWith("http://") && !text.startsWith("https://")) {
            return ctx.replyWithMarkdown(
              "❌ *Ошибка!*\n\nСсылка должна начинаться с `http://` или `https://`\n\nПопробуйте снова:"
            );
          }
          state.link = text;
          state.step = "waiting_description";
          return ctx.replyWithMarkdown(
            "📄 *Шаг 3 из 3*\n\nДобавьте краткое описание (максимум 200 символов):"
          );

        case "waiting_description":
          if (text.length > 200) {
            return ctx.replyWithMarkdown(
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
          return ctx.replyWithMarkdown(
            "✅ *Статья успешно отправлена!*\n\nМодератор проверит её в ближайшее время"
          );
      }
    }

    // --- ДИЗАЙНЕР: Обработка ссылки на дизайн, если ждем ссылку ---
    if (state && state.step === "waiting_design_url") {
      // Проверяем валидность ссылки
      if (!/^https?:\/\/\S+$/i.test(text)) {
        state.attempts = (state.attempts || 3) - 1;
        if (state.attempts > 0) {
          return ctx.replyWithMarkdown(
            `❌ *Некорректная ссылка!*\nОсталось попыток: ${state.attempts}\n\n` +
              "Отправьте корректную ссылку на дизайн (например, https://drive.google.com/...)"
          );
        } else {
          delete userStates[userId];
          return ctx.reply("🚫 Превышено количество попыток. Начните заново командой /design");
        }
      }

      // Проверяем, нет ли уже активного дизайна на эту статью от этого дизайнера
      const existingDesign = db.get("designs")
        .find({ articleId: state.articleId, designerId: userId, status: "pending" })
        .value();

      if (existingDesign) {
        delete userStates[userId];
        return ctx.replyWithMarkdown(
          `⚠️ *Уже есть активный дизайн!*\n\n` +
            `🔗 Текущая ссылка: ${existingDesign.designUrl}\n\n` +
            `Дождитесь модерации или отмените текущую сессию командой /cancel`
        );
      }

      // Сохраняем дизайн
      db.get("designs").push({
        id: Date.now(),
        articleId: state.articleId,
        designerId: userId,
        designUrl: text,
        status: "pending",
        createdAt: new Date().toISOString(),
      }).write();

      const article = db.get("articles").find({ id: state.articleId }).value();

      await bot.telegram.sendMessage(
        MODERATOR_ID,
        `🎨 *Новый дизайн для статьи:*\n\n` +
          `📌 ${article.title}\n` +
          `👤 Дизайнер: @${ctx.from.username || "без username"}\n` +
          `🔗 Ссылка: ${text}`,
        { parse_mode: "Markdown" }
      );

      delete userStates[userId];

      return ctx.replyWithMarkdown(
        "✅ *Дизайн успешно отправлен!*\n\n" +
          "Модератор проверит вашу работу в ближайшее время\n\n" +
          "Для нового дизайна используйте /design"
      );
    }

    // Если не в процессе — передаем дальше
    return next();
  });

  // --- МОДЕРАТОР: Одобрение статьи ---
  bot.action(/approve_(\d+)/, async (ctx) => {
    if (ctx.from.id !== MODERATOR_ID) {
      return ctx.answerCbQuery("🚫 Нет прав доступа!", { show_alert: true });
    }

    const articleId = parseInt(ctx.match[1]);
    const article = db.get("articles").find({ id: articleId }).value();

    if (!article) {
      return ctx.answerCbQuery("❌ Статья не найдена!", { show_alert: true });
    }

    db.get("articles")
      .find({ id: articleId })
      .assign({ status: "approved", moderatedAt: new Date().toISOString() })
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
      { parse_mode: "Markdown" }
    );

    await ctx.answerCbQuery();
  });

  // --- МОДЕРАТОР: Отклонение статьи ---
  bot.action(/reject_(\d+)/, async (ctx) => {
    if (ctx.from.id !== MODERATOR_ID) {
      return ctx.answerCbQuery("🚫 Нет прав доступа!", { show_alert: true });
    }

    const articleId = parseInt(ctx.match[1]);
    const article = db.get("articles").find({ id: articleId }).value();

    if (!article) {
      return ctx.answerCbQuery("❌ Статья не найдена!", { show_alert: true });
    }

    try {
      await bot.telegram.sendMessage(
        article.author,
        `❌ Ваша статья отклонена:\n\n` +
          `📌 "${article.title}"\n` +
          `🔗 ${article.link}\n\n` +
          `Причина: стандартный шаблон отклонения`
      );
    } catch (err) {
      console.error("Не удалось уведомить автора:", err);
    }

    db.get("articles").remove({ id: articleId }).write();

    await ctx.editMessageText(
      `❌ Статья удалена:\n\n` + `📌 "${article.title}"`,
      { parse_mode: "Markdown" }
    );

    await ctx.answerCbQuery();
  });

  // --- ДИЗАЙНЕР: Команда /design ---
  bot.command("design", async (ctx) => {
    const userId = ctx.from.id;

    if (userStates[userId]) {
      const currentArticle = db.get("articles")
        .find({ id: userStates[userId].articleId })
        .value();

      return ctx.replyWithMarkdown(
        `🚫 *У вас уже есть активная сессия!*\n\n` +
          `📌 Текущая статья: "${currentArticle.title}"\n` +
          `🔗 Ссылка: ${currentArticle.link}\n\n` +
          `Завершите текущий дизайн или отмените командой /cancel`
      );
    }

    const articles = db.get("articles")
      .filter({ status: "approved" })
      .value();

    if (!articles.length) {
      return ctx.replyWithMarkdown(
        "📭 *Нет статей для дизайна!*\nВсе статьи уже в работе или ожидают модерации."
      );
    }

    // Подсчёт текущих дизайнеров на статью
    const articleCounts = db.get("designs")
      .filter({ status: "pending" })
      .groupBy("articleId")
      .map((designs, articleId) => ({ articleId, count: designs.length }))
      .keyBy("articleId")
      .value();

    const buttons = articles.map((article) => {
      const count = articleCounts[article.id]?.count || 0;
      return [
        Markup.button.callback(
          `📌 ${article.title.slice(0, 40)} (дизайнеров: ${count})`,
          `select_article_${article.id}`
        ),
      ];
    });

    await ctx.replyWithMarkdown(
      "📚 *Доступные статьи:*\nВыберите статью для дизайна:",
      Markup.inlineKeyboard(buttons)
    );
  });

  // --- ДИЗАЙНЕР: Выбор статьи ---
  bot.action(/select_article_(\d+)/, async (ctx) => {
    const userId = ctx.from.id;

    if (userStates[userId]) {
      return ctx.answerCbQuery("🚫 Завершите текущую сессию!", { show_alert: true });
    }

    const articleId = parseInt(ctx.match[1]);
    const article = db.get("articles").find({ id: articleId, status: "approved" }).value();

    if (!article) {
      await ctx.answerCbQuery("❌ Статья недоступна!", { show_alert: true });
      return;
    }

    userStates[userId] = {
      articleId,
      step: "waiting_design_confirm",
    };

    await ctx.replyWithMarkdown(
      `📚 *Описание статьи:*\n\n` +
        `📌 *Заголовок:* ${article.title}\n` +
        `📄 *Описание:*\n${article.description || "Описание отсутствует"}\n\n` +
        `🔗 *Ссылка на статью будет доступна после подтверждения*`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback("✅ Подтвердить", `confirm_article_${articleId}`),
          Markup.button.callback("❌ Отменить", "cancel_design"),
        ],
      ])
    );

    await ctx.answerCbQuery();
  });

  // --- ДИЗАЙНЕР: Подтверждение статьи ---
  bot.action(/confirm_article_(\d+)/, async (ctx) => {
    const userId = ctx.from.id;
    const articleId = parseInt(ctx.match[1]);
    const session = userStates[userId];

    if (!session || session.articleId !== articleId) {
      return ctx.answerCbQuery("🚫 Сессия устарела!", { show_alert: true });
    }

    session.step = "waiting_design_url";
    session.attempts = 3;

    const article = db.get("articles").find({ id: articleId }).value();

    await ctx.editMessageText(
      `📌 *Статья подтверждена:* ${article.title}\n\n` +
        `🔗 *Ссылка на статью:* ${article.link}\n\n` +
        `🌐 Теперь отправьте ссылку на дизайн:`,
      { parse_mode: "Markdown" }
    );

    await ctx.answerCbQuery();
  });

  // --- ДИЗАЙНЕР: Отмена сессии ---
  bot.action("cancel_design", async (ctx) => {
    const userId = ctx.from.id;
    if (userStates[userId]) {
      delete userStates[userId];
      await ctx.editMessageText("❌ Вы отменили выбор статьи.");
      await ctx.answerCbQuery();
      return ctx.replyWithMarkdown("🔄 Вы можете выбрать другую статью командой /design");
    }
    await ctx.answerCbQuery("🚫 Нет активной сессии!", { show_alert: true });
  });

  // --- ДИЗАЙНЕР: Команда /cancel для отмены сессии ---
  bot.command("cancel", (ctx) => {
    const userId = ctx.from.id;
    if (userStates[userId]) {
      delete userStates[userId];
      return ctx.reply("✅ Текущая сессия отменена");
    }
    return ctx.reply("⚠️ Нет активных сессий для отмены");
  });
}

module.exports = { combinedHandler };
