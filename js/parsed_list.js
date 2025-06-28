// 历史题库页面JS逻辑，原本在HTML内联
async function renderHistory() {
    let history = [];
    try {
        // 从后端获取历史题库索引
        const resp = await fetch('http://127.0.0.1:5000/api/history_questions');
        const data = await resp.json();
        if (data.success && Array.isArray(data.history)) {
            history = data.history;
        }
    } catch(e) {
        history = [];
    }
    const list = document.getElementById('historyList');
    const emptyTip = document.getElementById('emptyTip');
    list.innerHTML = '';
    if (!history.length) {
        emptyTip.style.display = '';
        return;
    }
    emptyTip.style.display = 'none';
    history.forEach((item, idx) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <div class="history-info-row">
                <span class="history-title">${item.origin_name || item.title || '题库'+(idx+1)}</span>
                <span class="history-meta">${item.time || ''}</span>
            </div>
            <div class="history-extra">
                <span>文件名：${item.origin_name || item.title || '题库'+(idx+1)}</span>
            </div>
            <div class="history-btn-row">
                <button class="quiz-btn" data-idx="${idx}">刷本题库</button>
                <button class="preview-btn" data-idx="${idx}">预览</button>
                <button class="del-btn" data-idx="${idx}">删除</button>
            </div>
        `;
        list.appendChild(li);
    });
    // 刷本题库
    list.querySelectorAll('.quiz-btn').forEach(btn => {
        btn.onclick = function() {
            const idx = parseInt(this.getAttribute('data-idx'));
            if (history[idx]) {
                const file = history[idx].file;
                if (!file) {
                    alert('找不到题库文件名，无法刷题');
                    return;
                }
                // 从后端拉取题库内容，存入sessionStorage，跳转刷题页
                fetch(`http://127.0.0.1:5000/data/parsed/${file}`)
                    .then(resp => resp.json())
                    .then(questions => {
                        console.log('fetch questions:', questions);
                        sessionStorage.setItem('quiz_questions', JSON.stringify(questions));
                        sessionStorage.setItem('quiz_title', history[idx].origin_name || history[idx].title || '题库');
                        console.log('sessionStorage.quiz_questions:', sessionStorage.getItem('quiz_questions'));
                        window.location.href = 'quiz.html';
                    })
                    .catch((e) => {
                        alert('题库文件读取失败');
                        console.error(e);
                    });
            }
        };
    });
    // 预览
    list.querySelectorAll('.preview-btn').forEach(btn => {
        btn.onclick = function() {
            const idx = parseInt(this.getAttribute('data-idx'));
            if (history[idx]) {
                const file = history[idx].file;
                if (!file) {
                    alert('找不到题库文件名，无法预览');
                    return;
                }
                fetch(`http://127.0.0.1:5000/data/parsed/${file}`)
                    .then(resp => resp.json())
                    .then(questions => {
                        const contentDiv = document.getElementById('previewContent');
                        contentDiv.innerHTML = questions.map((q, i) => {
                            let opts = '';
                            if (Array.isArray(q.options)) {
                                opts = q.options.map((opt, idx) => `<div class="preview-q-opts">${opt}</div>`).join('');
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
                        document.getElementById('previewModal').style.display = 'flex';
                        // 隐藏返回主页按钮
                        var backBtn = document.querySelector('.back-home-btn');
                        if (backBtn) backBtn.style.display = 'none';
                    })
                    .catch(() => {
                        alert('题库文件读取失败');
                    });
            }
        };
    });
    // 删除
    list.querySelectorAll('.del-btn').forEach(btn => {
        btn.onclick = async function() {
            const idx = parseInt(this.getAttribute('data-idx'));
            if (!history[idx]) return;
            if (!confirm('确定要删除该题库吗？')) return;
            const file = history[idx].file;
            if (!file) {
                alert('找不到题库文件名，无法删除');
                return;
            }
            try {
                const resp = await fetch('http://127.0.0.1:5000/api/delete_history', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ file })
                });
                const data = await resp.json();
                if (data.success) {
                    renderHistory();
                } else {
                    alert('删除失败：' + (data.error || '未知错误'));
                }
            } catch (e) {
                alert('请求后端删除失败');
            }
        };
    });
}
renderHistory();
document.getElementById('closePreviewBtn').onclick = function() {
    document.getElementById('previewModal').style.display = 'none';
    // 恢复返回主页按钮
    var backBtn = document.querySelector('.back-home-btn');
    if (backBtn) backBtn.style.display = '';
};
