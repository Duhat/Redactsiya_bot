const { isModerator } = require('../config');
module.exports = (ctx, next) => {
  ctx.isModerator = isModerator(ctx.from?.id);
  return next();
};