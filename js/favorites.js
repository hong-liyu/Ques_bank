document.addEventListener('DOMContentLoaded', async function () {
    const folderNameInput = document.getElementById('folderNameInput');
    const createFolderBtn = document.getElementById('createFolderBtn');
    const folderList = document.getElementById('folderList');
    const activeFolderTitle = document.getElementById('activeFolderTitle');
    const activeFolderMeta = document.getElementById('activeFolderMeta');
    const studyFolderBtn = document.getElementById('studyFolderBtn');
    const favoriteItems = document.getElementById('favoriteItems');
    const favoriteEmptyTip = document.getElementById('favoriteEmptyTip');

    let activeFolderId = '';

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    async function renderFolders() {
        await refreshFavoriteCache();
        const folders = getFavoriteFolders();
        folderList.innerHTML = '';

        if (!activeFolderId && folders.length) {
            activeFolderId = folders[0].id;
        }

        folders.forEach((folder) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = `folder-item${activeFolderId === folder.id ? ' active' : ''}`;
            item.innerHTML = `
                <span class="folder-item-name">${escapeHtml(folder.name)}</span>
                <span class="folder-item-count">${folder.count || 0} 题</span>
            `;
            item.onclick = () => {
                activeFolderId = folder.id;
                renderFolders();
                renderItems();
            };
            folderList.appendChild(item);
        });
    }

    function renderItems() {
        const folders = getFavoriteFolders();
        const activeFolder = folders.find((folder) => folder.id === activeFolderId);
        const items = getFavoriteItems(activeFolderId);

        activeFolderTitle.textContent = activeFolder ? activeFolder.name : '请选择收藏夹';
        activeFolderMeta.textContent = activeFolder ? `共 ${items.length} 题，可直接开始刷题。` : '在左侧切换收藏夹，查看题目并开始刷题。';
        studyFolderBtn.disabled = !activeFolder || !items.length;

        favoriteItems.innerHTML = '';
        favoriteEmptyTip.style.display = items.length ? 'none' : 'block';

        items.forEach((item) => {
            const card = document.createElement('div');
            card.className = 'favorite-item-card';
            card.innerHTML = `
                <h3>${escapeHtml(item.content || '未命名题目')}</h3>
                <div class="favorite-item-meta">
                    <span class="favorite-item-pill">${escapeHtml(item.type || '未知题型')}</span>
                    <span class="favorite-item-pill">${escapeHtml(item.source_title || '未标记来源')}</span>
                </div>
                <div class="favorite-item-actions">
                    <button type="button" class="action-btn delete-btn" data-item-id="${escapeHtml(item.id)}">移除</button>
                </div>
            `;
            favoriteItems.appendChild(card);
        });

        favoriteItems.querySelectorAll('.delete-btn').forEach((btn) => {
            btn.onclick = async function () {
                const itemId = this.getAttribute('data-item-id');
                const item = items.find((entry) => entry.id === itemId);
                if (!item) return;
                try {
                    await removeFavorite(item, activeFolderId, itemId);
                    await renderFolders();
                    renderItems();
                    if (typeof showToast === 'function') showToast('已移除收藏', 'success');
                } catch (error) {
                    if (typeof showToast === 'function') showToast(error.message || '移除失败', 'error');
                }
            };
        });
    }

    createFolderBtn.addEventListener('click', async function () {
        const name = folderNameInput.value.trim();
        if (!name) {
            if (typeof showToast === 'function') showToast('请输入收藏夹名称', 'error');
            return;
        }
        try {
            const folder = await createFavoriteFolder(name);
            activeFolderId = folder.id;
            folderNameInput.value = '';
            await renderFolders();
            renderItems();
            if (typeof showToast === 'function') showToast('收藏夹创建成功', 'success');
        } catch (error) {
            if (typeof showToast === 'function') showToast(error.message || '创建收藏夹失败', 'error');
        }
    });

    studyFolderBtn.addEventListener('click', function () {
        const items = getFavoriteItems(activeFolderId).map((item) => ({
            type: item.type,
            content: item.content,
            options: item.options,
            answer: item.answer
        }));
        if (!items.length) return;
        const folder = getFavoriteFolders().find((entry) => entry.id === activeFolderId);
        sessionStorage.setItem('quiz_questions', JSON.stringify(items));
        sessionStorage.setItem('quiz_title', folder ? `${folder.name} · 收藏夹` : '收藏夹');
        window.location.href = 'quiz.html';
    });

    await renderFolders();
    renderItems();
});
