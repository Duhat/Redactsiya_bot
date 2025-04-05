const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const adapter = new FileSync('db.json');
const db = low(adapter);

// Инициализация структуры данных
db.defaults({ articles: [], designs: [], users:[], logs: [] }).write();

// Добавьте эту функцию
const getArticlesPage = (page = 1, pageSize = 5, filter = 'all') => {
  const data = filter === 'all' 
    ? db.get('articles').value()
    : db.get('articles').filter({ status: filter }).value();

  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;

  return {
    articles: data.slice(startIndex, endIndex),
    total: data.length,
    page,
    totalPages: Math.ceil(data.length / pageSize)
  };
};

module.exports = {
  db,
  getArticlesPage // Экспортируем функцию
};