const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");

function setupDB() {
  const adapter = new FileSync("db.json");
  const db = low(adapter);

  db.defaults({
    articles: [],
    designs: [],
  }).write();

  return db;
}

module.exports = {
  setupDB,
};
