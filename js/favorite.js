// 收藏相关工具函数，支持 localStorage 和后端接口
const FAVORITE_KEY = 'quiz_favorites';

// 获取本地收藏列表
function getLocalFavorites() {
    try {
        const fav = localStorage.getItem(FAVORITE_KEY);
        return fav ? JSON.parse(fav) : [];
    } catch (e) { return []; }
}
// 保存本地收藏列表
function setLocalFavorites(list) {
    localStorage.setItem(FAVORITE_KEY, JSON.stringify(list));
}
// 判断题目是否已收藏（用题干、选项、答案、类型判重）
function isFavorite(question, favList) {
    const key = JSON.stringify({
        content: question.content,
        options: question.options,
        answer: question.answer,
        type: question.type
    });
    return favList.some(q => JSON.stringify({
        content: q.content,
        options: q.options,
        answer: q.answer,
        type: q.type
    }) === key);
}
// 添加收藏
async function addFavorite(question) {
    // 先本地
    let favs = getLocalFavorites();
    if (!isFavorite(question, favs)) {
        favs.push(question);
        setLocalFavorites(favs);
    }
    // 再后端
    try {
        await fetch('/api/favorite_question', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(question)
        });
    } catch (e) {}
}
// 取消收藏
async function removeFavorite(question) {
    let favs = getLocalFavorites();
    favs = favs.filter(q => !isFavorite(question, [q]));
    setLocalFavorites(favs);
    // 同步到后端
    try {
        await fetch('/api/favorite_question', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(question)
        });
    } catch (e) {}
}
