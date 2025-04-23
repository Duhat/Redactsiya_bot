const { Markup } = require("telegraf");

function editorHandler(bot, db, MODERATOR_ID) {
  console.log("editor handler loaded");

  bot.on("text", async (ctx, next) => {
    const text = ctx.message?.text;
    if (!text) return next();

    // Разбиваем текст на строки и ищем нужные поля
    const lines = text.split('\n').map(line => line.trim());
    if (lines.length < 2) return next();

    const titleLine = lines.find(line => line.toLowerCase().startsWith("название:"));
    const linkLine = lines.find(line => line.toLowerCase().startsWith("ссылка:"));

    if (!titleLine || !linkLine) return next();

    const title = titleLine.slice("название:".length).trim();
    const link = linkLine.slice("ссылка:".length).trim();

    if (!title) {
      return ctx.reply("❌ Не указано название статьи. Пожалуйста, используйте формат:\n\nНазвание: <название статьи>\nСсылка: <ссылка на статью>");
    }

    if (!link || (!link.startsWith("http://") && !link.startsWith("https://"))) {
      return ctx.reply("❌ Неверный формат ссылки. Ссылка должна начинаться с http:// или https://");
    }

    // Создаём новую статью
    const newArticle = {
      id: Date.now(),
      title,
      link,
      description: "", // Описание можно добавить позже
      status: "pending",
      author: ctx.from.id,
      createdAt: new Date().toISOString(),
    };

    db.get("articles").push(newArticle).write();

    // Отправляем уведомление модератору
    await bot.telegram.sendMessage(
      MODERATOR_ID,
      `📝 *Новая статья на модерации!*\n\n` +
      `📌 Заголовок: ${title}\n` +
      `🔗 Ссылка: ${link}`,
      Markup.inlineKeyboard([
        [Markup.button.callback("✅ Одобрить", `approve_${newArticle.id}`)],
        [Markup.button.callback("❌ Отклонить", `reject_${newArticle.id}`)],
      ])
    );

    // Ответ пользователю
    return ctx.replyWithMarkdown("✅ *Статья успешно отправлена!*\n\nМодератор проверит её в ближайшее время");
  });
}

module.exports = { editorHandler };
