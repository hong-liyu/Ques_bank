document.addEventListener('DOMContentLoaded', function() {
    const historyGrid = document.getElementById('historyGrid');
    const emptyTip = document.getElementById('emptyTip');
    const searchQueryInput = document.getElementById('searchQuery');
    const sortOrderSelect = document.getElementById('sortOrder');
    const previewModal = document.getElementById('previewModal');
    const previewContent = document.getElementById('previewContent');
    const closePreviewBtn = document.querySelector('#previewModal .close-button');
    const backHomeBtn = document.querySelector('.back-home-btn');

    let allHistory = []; // Store all fetched history

    // 添加刷新按钮到过滤控件中
    function addRefreshButton() {
        const filterControls = document.querySelector('.filter-controls');
        if (filterControls && !document.getElementById('refreshBtn')) {
            const refreshBtn = document.createElement('button');
            refreshBtn.id = 'refreshBtn';
            refreshBtn.type = 'button';
            refreshBtn.className = 'action-btn';
            refreshBtn.style.cssText = 'background:#059669;color:white;border:none;padding:0.8em 1.2em;border-radius:0.5em;cursor:pointer;';
            refreshBtn.innerHTML = '🔄 刷新列表';
            refreshBtn.title = '刷新题库列表，同步最新数据';
            refreshBtn.onclick = function() {
                this.disabled = true;
                this.innerHTML = '刷新中...';
                fetchAndRenderHistory().then(() => {
                    this.disabled = false;
                    this.innerHTML = '🔄 刷新列表';
                }).catch(() => {
                    this.disabled = false;
                    this.innerHTML = '🔄 刷新列表';
                });
            };
            filterControls.appendChild(refreshBtn);
        }
    }

    async function fetchAndRenderHistory() {
        try {
            // 添加时间戳防止浏览器缓存
            const resp = await fetch('/api/history_questions?t=' + Date.now());
            const data = await resp.json();
            if (data.success && Array.isArray(data.history)) {
                allHistory = data.history;
                console.log(`成功获取 ${allHistory.length} 个题库记录`);
            } else {
                allHistory = [];
            }
        } catch(e) {
            console.error('Error fetching history questions:', e);
            allHistory = [];
        }
        renderFilteredAndSortedHistory();
    }

    function renderFilteredAndSortedHistory() {
        let currentHistory = [...allHistory]; // Create a mutable copy

        // 1. Filter based on search query
        const query = searchQueryInput.value.toLowerCase();
        if (query) {
            currentHistory = currentHistory.filter(item =>
                (item.origin_name && item.origin_name.toLowerCase().includes(query)) ||
                (item.title && item.title.toLowerCase().includes(query)) ||
                (item.file && item.file.toLowerCase().includes(query))
            );
        }

        // 2. Sort based on sort order
        const sortOrder = sortOrderSelect.value;
        currentHistory.sort((a, b) => {
            const dateA = new Date(a.time);
            const dateB = new Date(b.time);
            if (sortOrder === 'newest') {
                return dateB - dateA;
            } else {
                return dateA - dateB;
            }
        });

        historyGrid.innerHTML = '';
        if (!currentHistory.length) {
            emptyTip.style.display = 'block';
            return;
        }
        emptyTip.style.display = 'none';

        currentHistory.forEach((item, idx) => {
            const card = document.createElement('div');
            card.className = 'history-card';
            card.innerHTML = `
                <div class="card-info">
                    <h3>${item.origin_name || item.title || '未命名题库'}</h3>
                    <p class="file-name" style="display:none;">文件名: ${item.file}</p>
                    <p class="upload-time">上传时间: ${item.time || '未知'}</p>
                </div>
                <div class="card-actions">
                    <button class="action-btn study-btn" data-file="${item.file}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                        刷题
                    </button>
                    <button class="action-btn preview-btn" data-file="${item.file}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                        预览
                    </button>
                    <button class="action-btn rename-btn" data-file="${item.file}" data-name="${item.origin_name || item.title || '未命名题库'}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                        重命名
                    </button>
                    <button class="action-btn delete-btn" data-file="${item.file}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        删除
                    </button>
                </div>
            `;
            historyGrid.appendChild(card);
        });

        // Attach event listeners to new buttons
        attachEventListeners();
    }

    function attachEventListeners() {
        historyGrid.querySelectorAll('.study-btn').forEach(btn => {
            btn.onclick = async function() {
                const file = this.getAttribute('data-file');
                if (!file) {
                    if (typeof showToast === 'function') showToast('找不到题库文件名，无法刷题', 'error');
                    else alert('找不到题库文件名，无法刷题');
                    return;
                }
                
                const item = allHistory.find(h => h.file === file);
                const title = item ? (item.origin_name || item.title || '题库') : '题库';
                
                // 【优化内存限制】不再使用 sessionStorage 直接存储超大 JSON
                // 而是通过 URL 参数传递文件名到 quiz.html，由其自主 fetch
                window.location.href = `quiz.html?file=${encodeURIComponent(file)}&title=${encodeURIComponent(title)}`;
            };
        });

        historyGrid.querySelectorAll('.preview-btn').forEach(btn => {
            btn.onclick = async function() {
                const file = this.getAttribute('data-file');
                if (!file) {
                    if (typeof showToast === 'function') showToast('找不到题库文件名，无法预览', 'error');
                    else alert('找不到题库文件名，无法预览');
                    return;
                }
                try {
                    const resp = await fetch(`/data/parsed/${file}`);
                    const questions = await resp.json();

                    previewContent.innerHTML = questions.map((q, i) => {
                        let opts = '';
                        if (Array.isArray(q.options)) {
                            opts = q.options.map((opt, idx) => `<div class="preview-q-opts">${String.fromCharCode(65 + idx)}. ${opt}</div>`).join('');
                        }
                        let ans = '';
                        if (Array.isArray(q.answer)) {
                            ans = q.answer.join(', ');
                        } else if (typeof q.answer === 'string') {
                            ans = q.answer;
                        }
                        return `<div class="preview-question">
                            <div class="preview-q-title">题目${i+1}（${q.type || '未知类型'}）：${q.content || q.text || ''}</div>
                            ${opts ? '选项：<br>' + opts : ''}
                            <div class="preview-q-ans">答案：${ans || '无'}</div>
                        </div>`;
                    }).join('');
                    previewModal.style.display = 'flex';
                    if (backHomeBtn) backHomeBtn.style.display = 'none';
                } catch (e) {
                    if (typeof showToast === 'function') showToast('题库文件读取失败', 'error');
                    else alert('题库文件读取失败');
                    console.error(e);
                }
            };
        });

        historyGrid.querySelectorAll('.delete-btn').forEach(btn => {
            btn.onclick = async function() {
                const file = this.getAttribute('data-file');
                if (!file) {
                    if (typeof showToast === 'function') showToast('找不到题库文件名，无法删除', 'error');
                    return;
                }
                
                const confirmed = typeof showConfirmDialog === 'function' ? 
                    await showConfirmDialog({
                        title: '删除确认',
                        message: '确定要永久删除该题库及解析出的文件吗？<br>此操作无法撤销。',
                        confirmText: '删除',
                        type: 'danger'
                    }) : confirm('确定要删除该题库吗？');
                
                if (!confirmed) return;

                try {
                    const resp = await fetch('/api/delete_history', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ file })
                    });
                    const data = await resp.json();
                    if (data.success) {
                        if (typeof showToast === 'function') showToast('删除成功', 'success');
                        fetchAndRenderHistory(); // Re-fetch and re-render after deletion
                    } else {
                        if (typeof showToast === 'function') showToast('删除失败：' + (data.error || '未知错误'), 'error');
                    }
                } catch (e) {
                    if (typeof showToast === 'function') showToast('请求后端删除失败', 'error');
                    console.error(e);
                }
            };
        });

        // Rename button event handlers
        historyGrid.querySelectorAll('.rename-btn').forEach(btn => {
            btn.onclick = async function() {
                const file = this.getAttribute('data-file');
                const currentName = this.getAttribute('data-name');
                
                if (!file) {
                    if (typeof showToast === 'function') showToast('找不到题库文件，无法重命名', 'error');
                    return;
                }

                // Prompt user for new name
                const newName = typeof showPromptDialog === 'function' ? 
                    await showPromptDialog({
                        title: '重命名题库',
                        defaultValue: currentName,
                        placeholder: '请输入新名称...'
                    }) : prompt('请输入新的题库名称:', currentName);

                if (!newName || newName.trim() === '') {
                    return; // User cancelled or entered empty string
                }

                const trimmedName = newName.trim();
                if (trimmedName === currentName) {
                    return; // No change needed
                }

                try {
                    const resp = await fetch('/api/rename_question', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            old_file: file, 
                            new_name: trimmedName 
                        })
                    });
                    const data = await resp.json();
                    if (data.success) {
                        if (typeof showToast === 'function') showToast('重命名成功！', 'success');
                        fetchAndRenderHistory(); // Re-fetch and re-render after rename
                    } else {
                        if (typeof showToast === 'function') showToast('重命名失败：' + (data.error || '未知错误'), 'error');
                    }
                } catch (e) {
                    if (typeof showToast === 'function') showToast('请求后端重命名失败', 'error');
                    console.error(e);
                }
            };
        });
    }

    // Event listeners for filter and sort controls
    searchQueryInput.addEventListener('input', renderFilteredAndSortedHistory);
    sortOrderSelect.addEventListener('change', renderFilteredAndSortedHistory);

    // Close preview modal
    closePreviewBtn.addEventListener('click', function() {
        previewModal.style.display = 'none';
        if (backHomeBtn) backHomeBtn.style.display = 'flex'; // Restore display for flex
    });

    window.addEventListener('click', function(event) {
        if (event.target == previewModal) {
            previewModal.style.display = 'none';
            if (backHomeBtn) backHomeBtn.style.display = 'flex'; // Restore display for flex
        }
    });

    // Initial fetch and render
    addRefreshButton();
    fetchAndRenderHistory();

    // 可选：每60秒自动刷新一次（确保数据同步）
    // 注：可根据需要调整时间间隔或注释掉此行
    setInterval(fetchAndRenderHistory, 60000);  // 60秒刷新一次
});
