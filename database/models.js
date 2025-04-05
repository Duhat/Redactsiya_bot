class Article {
  /**
   * Конструктор статьи
   * @param {number} userId - ID пользователя
   * @param {string} title - Название статьи
   * @param {string} url - Ссылка на документ
   */
  constructor(userId, title, url) {
      this.id = Date.now();
      this.user_id = userId;
      this.title = title;
      this.url = url;
      this.status = 'pending';
      this.created_at = new Date().toISOString();
      this.updated_at = null;
      this.active_designers = 0; // Новое поле
      this.designs = []; // Все дизайны статьи
  }

  /**
   * Обновляет статус статьи
   * @param {string} newStatus - Новый статус
   */
  updateStatus(newStatus) {
      this.status = newStatus;
      this.updated_at = new Date().toISOString();
  }

  /**
   * Добавляет новый дизайн
   * @param {object} design - Данные дизайна
   */
  addDesign(design) {
      this.designs.push({
          ...design,
          id: Date.now(),
          status: 'pending',
          created_at: new Date().toISOString()
      });
      this.active_designers = this.designs.filter(d => d.status === 'pending').length;
  }
}
  class Design {
    constructor(articleId, designerId, fileUrl) {
      this.id = Date.now();
      this.articleId = articleId;
      this.designerId = designerId;
      this.fileUrl = fileUrl;
      this.status = 'pending'; // pending/approved/rejected
      this.created_at = new Date().toISOString();
    }
  }
  
  
  module.exports = { Article, Design };