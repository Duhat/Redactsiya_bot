require('dotenv').config();

module.exports = {
  botToken: process.env.BOT_TOKEN,
  moderatorId: process.env.MODERATOR_ID,
  isModerator: (userId) => 
    userId?.toString() === process.env.MODERATOR_ID
};