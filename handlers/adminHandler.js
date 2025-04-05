const { db } = require('../database');

module.exports = (bot) => {
  bot.command('cleardb', async (ctx) => {
    if (ctx.from.id.toString() !== process.env.MODERATOR_ID) return;

    // Очистка всех коллекций
    db.setState({
      articles: [],
      designs: [],
      logs: []
    }).write();

    await ctx.reply('✅ База данных очищена!');
  });
};