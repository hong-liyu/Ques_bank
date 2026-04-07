const FAVORITE_CACHE_KEY = 'quiz_favorite_cache_v2';

let favoriteCache = {
    folders: [],
    items: []
};

function favoriteQuestionKey(question) {
    return JSON.stringify({
        content: question.content ?? null,
        options: question.options ?? null,
        answer: question.answer ?? null,
        type: question.type ?? null
    });
}

function loadFavoriteCacheFromLocal() {
    try {
        const raw = localStorage.getItem(FAVORITE_CACHE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed && Array.isArray(parsed.folders) && Array.isArray(parsed.items)) {
            favoriteCache = parsed;
        }
    } catch (error) {
        favoriteCache = { folders: [], items: [] };
    }
}

function saveFavoriteCacheToLocal() {
    localStorage.setItem(FAVORITE_CACHE_KEY, JSON.stringify(favoriteCache));
}

function getFavoriteFolders() {
    return favoriteCache.folders || [];
}

function getFavoriteItems(folderId = '') {
    const items = favoriteCache.items || [];
    return folderId ? items.filter((item) => item.folder_id === folderId) : items;
}

function isFavorite(question, items = getFavoriteItems()) {
    const key = favoriteQuestionKey(question);
    return items.some((item) => favoriteQuestionKey(item) === key);
}

function getQuestionFavoriteEntries(question) {
    const key = favoriteQuestionKey(question);
    return getFavoriteItems().filter((item) => favoriteQuestionKey(item) === key);
}

async function refreshFavoriteCache() {
    const [foldersResp, itemsResp] = await Promise.all([
        fetch('/api/favorite_folders'),
        fetch('/api/favorite_questions')
    ]);
    const foldersData = await foldersResp.json();
    const itemsData = await itemsResp.json();
    favoriteCache = {
        folders: foldersData.success && Array.isArray(foldersData.folders) ? foldersData.folders : [],
        items: itemsData.success && Array.isArray(itemsData.items) ? itemsData.items : []
    };
    saveFavoriteCacheToLocal();
    return favoriteCache;
}

async function ensureFavoriteCache() {
    if (!getFavoriteFolders().length && !getFavoriteItems().length) {
        try {
            await refreshFavoriteCache();
        } catch (error) {
            loadFavoriteCacheFromLocal();
        }
    }
    return favoriteCache;
}

async function createFavoriteFolder(name) {
    const resp = await fetch('/api/favorite_folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
    });
    const data = await resp.json();
    if (!data.success) {
        throw new Error(data.error || '创建收藏夹失败');
    }
    favoriteCache.folders.push(data.folder);
    saveFavoriteCacheToLocal();
    return data.folder;
}

function buildFavoritePayload(question, folderId, sourceMeta = {}) {
    return {
        folder_id: folderId,
        source_file: sourceMeta.source_file || null,
        source_title: sourceMeta.source_title || '未标记来源',
        type: question.type,
        content: question.content,
        options: question.options,
        answer: question.answer
    };
}

async function addFavorite(question, folderId, sourceMeta = {}) {
    const resp = await fetch('/api/favorite_questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildFavoritePayload(question, folderId, sourceMeta))
    });
    const data = await resp.json();
    if (!data.success) {
        throw new Error(data.error || '收藏失败');
    }
    favoriteCache.items.push(data.item);
    if (Array.isArray(data.folders)) {
        favoriteCache.folders = data.folders;
    }
    saveFavoriteCacheToLocal();
    return data.item;
}

async function removeFavorite(question, folderId, itemId = '') {
    const payload = itemId
        ? { folder_id: folderId, item_id: itemId }
        : buildFavoritePayload(question, folderId);
    const resp = await fetch('/api/favorite_questions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const data = await resp.json();
    if (!data.success) {
        throw new Error(data.error || '取消收藏失败');
    }
    favoriteCache.items = favoriteCache.items.filter((item) => {
        if (itemId) return item.id !== itemId;
        return !(item.folder_id === folderId && favoriteQuestionKey(item) === favoriteQuestionKey(question));
    });
    if (Array.isArray(data.folders)) {
        favoriteCache.folders = data.folders;
    }
    saveFavoriteCacheToLocal();
    return true;
}

loadFavoriteCacheFromLocal();
