document.addEventListener('DOMContentLoaded', function () {
    const historyGrid = document.getElementById('historyGrid');
    const emptyTip = document.getElementById('emptyTip');
    const searchQueryInput = document.getElementById('searchQuery');
    const sortOrderSelect = document.getElementById('sortOrder');
    const previewModal = document.getElementById('previewModal');
    const previewContent = document.getElementById('previewContent');
    const closePreviewBtn = document.querySelector('#previewModal .close-button');
    const backHomeBtn = document.querySelector('.back-home-btn');

    let allHistory = [];

    function normalizeStats(stats) {
        const raw = stats || {};
        return {
            completed_runs: Number.isFinite(Number(raw.completed_runs)) ? Math.max(0, Number(raw.completed_runs)) : 0,
            total_answered: Number.isFinite(Number(raw.total_answered)) ? Math.max(0, Number(raw.total_answered)) : 0,
            total_correct: Number.isFinite(Number(raw.total_correct)) ? Math.max(0, Number(raw.total_correct)) : 0
        };
    }

    function formatAccuracy(stats) {
        const normalized = normalizeStats(stats);
        if (!normalized.total_answered) return '--';
        return `${Math.round((normalized.total_correct / normalized.total_answered) * 100)}%`;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function createStatsMarkup(stats) {
        const normalized = normalizeStats(stats);
        return `
            <span class="history-stat-pill">已刷 ${normalized.completed_runs} 次</span>
            <span class="history-stat-pill">正确率 ${formatAccuracy(normalized)}</span>
        `;
    }

    function addRefreshButton() {
        const filterControls = document.querySelector('.filter-controls');
        if (!filterControls || document.getElementById('refreshBtn')) return;

        const refreshBtn = document.createElement('button');
        refreshBtn.id = 'refreshBtn';
        refreshBtn.type = 'button';
        refreshBtn.className = 'action-btn toolbar-btn';
        refreshBtn.textContent = '刷新列表';
        refreshBtn.onclick = function () {
            this.disabled = true;
            this.textContent = '刷新中...';
            fetchAndRenderHistory().finally(() => {
                this.disabled = false;
                this.textContent = '刷新列表';
            });
        };
        filterControls.appendChild(refreshBtn);
    }

    async function fetchAndRenderHistory() {
        try {
            const resp = await fetch('/api/history_questions?t=' + Date.now());
            const data = await resp.json();
            allHistory = data.success && Array.isArray(data.history) ? data.history : [];
        } catch (error) {
            console.error(error);
            allHistory = [];
        }
        renderFilteredAndSortedHistory();
    }

    function renderFilteredAndSortedHistory() {
        let currentHistory = [...allHistory];
        const query = searchQueryInput.value.trim().toLowerCase();

        if (query) {
            currentHistory = currentHistory.filter((item) =>
                (item.origin_name && item.origin_name.toLowerCase().includes(query)) ||
                (item.title && item.title.toLowerCase().includes(query)) ||
                (item.file && item.file.toLowerCase().includes(query))
            );
        }

        currentHistory.sort((a, b) => {
            const at = new Date(a.time || 0).getTime();
            const bt = new Date(b.time || 0).getTime();
            return sortOrderSelect.value === 'newest' ? bt - at : at - bt;
        });

        historyGrid.innerHTML = '';
        emptyTip.style.display = currentHistory.length ? 'none' : 'block';
        if (!currentHistory.length) return;

        currentHistory.forEach((item) => {
            const title = item.origin_name || item.title || '未命名题库';
            const card = document.createElement('article');
            card.className = 'history-card';
            card.innerHTML = `
                <div class="card-info">
                    <h3>${escapeHtml(title)}</h3>
                    <div class="history-card-meta">
                        <span class="history-meta-label">上传时间</span>
                        <span class="history-meta-value">${escapeHtml(item.time || '未知')}</span>
                    </div>
                    <div class="history-card-stats">${createStatsMarkup(item.stats)}</div>
                </div>
                <div class="card-actions">
                    <button class="action-btn study-btn" data-file="${escapeHtml(item.file || '')}">刷题</button>
                    <button class="action-btn neutral-btn preview-btn" data-file="${escapeHtml(item.file || '')}">预览</button>
                    <button class="action-btn neutral-btn split-btn" data-file="${escapeHtml(item.file || '')}" data-name="${escapeHtml(title)}">拆分</button>
                    <button class="action-btn neutral-btn rename-btn" data-file="${escapeHtml(item.file || '')}" data-name="${escapeHtml(title)}">重命名</button>
                    <button class="action-btn danger-btn delete-btn" data-file="${escapeHtml(item.file || '')}">删除</button>
                </div>
            `;
            historyGrid.appendChild(card);
        });

        attachEventListeners();
    }

    async function splitQuestionBank(file, title) {
        const modeInput = prompt('请输入拆分方式：range（按范围）或 even（均分）', 'even');
        if (!modeInput) return;

        const mode = modeInput.trim().toLowerCase();
        if (mode !== 'range' && mode !== 'even') {
            if (typeof showToast === 'function') showToast('拆分方式只能是 range 或 even', 'error');
            return;
        }

        const deleteOriginal = confirm('拆分完成后是否删除原题库？点击“取消”则保留原题库。');
        const payload = { file, mode, delete_original: deleteOriginal };

        if (mode === 'range') {
            const splitPointInput = prompt(`请输入拆分位置，例如 50，表示将 ${title} 拆成前 50 题和剩余题目`, '');
            if (!splitPointInput) return;

            const splitPoint = Number(splitPointInput);
            if (!Number.isInteger(splitPoint) || splitPoint <= 0) {
                if (typeof showToast === 'function') showToast('拆分位置必须是正整数', 'error');
                return;
            }
            payload.split_point = splitPoint;
        }

        const resp = await fetch('/api/split_question_bank', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await resp.json();
        if (!data.success) {
            throw new Error(data.error || '拆分失败');
        }
    }

    function attachEventListeners() {
        historyGrid.querySelectorAll('.study-btn').forEach((btn) => {
            btn.onclick = function () {
                const file = this.getAttribute('data-file');
                if (!file) return;
                const item = allHistory.find((entry) => entry.file === file);
                const title = item ? (item.origin_name || item.title || '题库') : '题库';
                window.location.href = `quiz.html?file=${encodeURIComponent(file)}&title=${encodeURIComponent(title)}`;
            };
        });

        historyGrid.querySelectorAll('.preview-btn').forEach((btn) => {
            btn.onclick = async function () {
                const file = this.getAttribute('data-file');
                if (!file) return;
                try {
                    const resp = await fetch(`/data/parsed/${file}`);
                    const questions = await resp.json();
                    previewContent.innerHTML = questions.map((q, i) => {
                        const opts = Array.isArray(q.options)
                            ? q.options.map((opt, idx) => `<div class="preview-q-opts">${String.fromCharCode(65 + idx)}. ${escapeHtml(opt)}</div>`).join('')
                            : '';
                        const ans = Array.isArray(q.answer) ? q.answer.join(', ') : (q.answer || '无');
                        return `
                            <div class="preview-question">
                                <div class="preview-q-title">题目${i + 1}（${escapeHtml(q.type || '未知类型')}）：${escapeHtml(q.content || q.text || '')}</div>
                                ${opts ? `选项：<br>${opts}` : ''}
                                <div class="preview-q-ans">答案：${escapeHtml(ans)}</div>
                            </div>
                        `;
                    }).join('');
                    previewModal.style.display = 'flex';
                    if (backHomeBtn) backHomeBtn.style.display = 'none';
                } catch (error) {
                    if (typeof showToast === 'function') showToast('题库文件读取失败', 'error');
                }
            };
        });

        historyGrid.querySelectorAll('.split-btn').forEach((btn) => {
            btn.onclick = async function () {
                const file = this.getAttribute('data-file');
                const title = this.getAttribute('data-name') || '题库';
                if (!file) return;
                try {
                    await splitQuestionBank(file, title);
                    if (typeof showToast === 'function') showToast('题库拆分完成', 'success');
                    fetchAndRenderHistory();
                } catch (error) {
                    if (typeof showToast === 'function') showToast(error.message || '题库拆分失败', 'error');
                }
            };
        });

        historyGrid.querySelectorAll('.delete-btn').forEach((btn) => {
            btn.onclick = async function () {
                const file = this.getAttribute('data-file');
                if (!file) return;
                const confirmed = confirm('确定要删除该题库吗？');
                if (!confirmed) return;

                const resp = await fetch('/api/delete_history', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ file })
                });
                const data = await resp.json();
                if (data.success) {
                    if (typeof showToast === 'function') showToast('删除成功', 'success');
                    fetchAndRenderHistory();
                } else if (typeof showToast === 'function') {
                    showToast(`删除失败：${data.error || '未知错误'}`, 'error');
                }
            };
        });

        historyGrid.querySelectorAll('.rename-btn').forEach((btn) => {
            btn.onclick = async function () {
                const file = this.getAttribute('data-file');
                const currentName = this.getAttribute('data-name');
                if (!file) return;
                const newName = prompt('请输入新的题库名称:', currentName);
                if (!newName || !newName.trim() || newName.trim() === currentName) return;

                const resp = await fetch('/api/rename_question', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        old_file: file,
                        new_name: newName.trim()
                    })
                });
                const data = await resp.json();
                if (data.success) {
                    if (typeof showToast === 'function') showToast('重命名成功', 'success');
                    fetchAndRenderHistory();
                } else if (typeof showToast === 'function') {
                    showToast(`重命名失败：${data.error || '未知错误'}`, 'error');
                }
            };
        });
    }

    searchQueryInput.addEventListener('input', renderFilteredAndSortedHistory);
    sortOrderSelect.addEventListener('change', renderFilteredAndSortedHistory);

    closePreviewBtn.addEventListener('click', function () {
        previewModal.style.display = 'none';
        if (backHomeBtn) backHomeBtn.style.display = 'flex';
    });

    window.addEventListener('click', function (event) {
        if (event.target === previewModal) {
            previewModal.style.display = 'none';
            if (backHomeBtn) backHomeBtn.style.display = 'flex';
        }
    });

    addRefreshButton();
    fetchAndRenderHistory();
    setInterval(fetchAndRenderHistory, 60000);
});
