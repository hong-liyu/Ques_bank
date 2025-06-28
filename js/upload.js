document.getElementById('uploadForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const form = e.target;
    const fileInput = document.getElementById('questionFile');
    const customPromptInput = document.getElementById('customPrompt');
    const msgDiv = document.getElementById('uploadMsg');
    const resultDiv = document.getElementById('parseResult');
    const toQuizBtn = document.getElementById('toQuizBtn');
    const submitBtn = form.querySelector('button[type="submit"]');

    if (!fileInput.files || fileInput.files.length === 0) {
        msgDiv.textContent = '请先选择一个文件。';
        msgDiv.style.color = 'red';
        return;
    }

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('custom_prompt', customPromptInput.value);

    msgDiv.textContent = '正在上传并请求解析...';
    msgDiv.style.color = '#333';
    resultDiv.textContent = '';
    toQuizBtn.style.display = 'none';
    submitBtn.disabled = true;

    try {
        const resp = await fetch('http://127.0.0.1:5000/api/ai_upload_question', {
            method: 'POST',
            body: formData
        });
        const data = await resp.json();
        if (!data.success) {
            msgDiv.textContent = '上传失败：' + (data.error || '未知错误');
            msgDiv.style.color = 'red';
            submitBtn.disabled = false;
            return;
        }
        // 进入轮询
        const taskId = data.task_id;
        msgDiv.textContent = '题库正在AI解析中，请稍候...';
        msgDiv.style.color = '#409eff';
        let polling = true;
        let pollCount = 0;
        async function pollProgress() {
            if (!polling) return;
            try {
                const res = await fetch(`http://127.0.0.1:5000/api/ai_upload_progress?task_id=${taskId}`);
                const prog = await res.json();
                if (!prog.success) {
                    msgDiv.textContent = '解析进度查询失败：' + (prog.error || '未知错误');
                    msgDiv.style.color = 'red';
                    polling = false;
                    submitBtn.disabled = false;
                    return;
                }
                if (prog.status === 'done') {
                    msgDiv.textContent = '上传并AI解析成功！';
                    msgDiv.style.color = '#2ecc71';
                    // 展示题目
                    resultDiv.innerHTML = prog.result.map((q, i) =>
                        `题目${i+1}（${q.type || '未知类型'}）：\n${q.content || '无内容'}\n选项：${q.options ? q.options.join(' ') : '无'}\n答案：${q.answer || '无'}`
                    ).join('\n\n');
                    // 存储题库到本地，供刷题页面使用
                    localStorage.setItem('quiz_questions', JSON.stringify(prog.result));
                    // 新增：追加到历史题库
                    try {
                        const fileInput = document.getElementById('questionFile');
                        const fileName = fileInput.files[0]?.name || '题库';
                        const now = new Date();
                        const timeStr = now.toLocaleString();
                        let history = [];
                        try {
                            history = JSON.parse(localStorage.getItem('quiz_history')) || [];
                        } catch(e) { history = []; }
                        history.push({
                            title: fileName,
                            time: timeStr,
                            questions: prog.result
                        });
                        localStorage.setItem('quiz_history', JSON.stringify(history));
                    } catch(e) {}
                    toQuizBtn.style.display = 'block';
                    polling = false;
                    submitBtn.disabled = false;
                } else if (prog.status === 'error') {
                    msgDiv.textContent = 'AI解析失败：' + (prog.error || '未知错误');
                    msgDiv.style.color = 'red';
                    polling = false;
                    submitBtn.disabled = false;
                } else {
                    // 继续轮询
                    pollCount++;
                    if (pollCount > 40) { // 最多轮询40次（约200秒）
                        msgDiv.textContent = 'AI解析超时，请稍后重试。';
                        msgDiv.style.color = 'red';
                        polling = false;
                        submitBtn.disabled = false;
                        return;
                    }
                    setTimeout(pollProgress, 5000); // 轮询间隔由1秒改为5秒
                }
            } catch (err) {
                msgDiv.textContent = '进度查询异常：' + err;
                msgDiv.style.color = 'red';
                polling = false;
                submitBtn.disabled = false;
            }
        }
        pollProgress();
    } catch (err) {
        msgDiv.textContent = '请求失败：无法连接到服务器。';
        msgDiv.style.color = 'red';
        submitBtn.disabled = false;
    }
});

document.getElementById('toQuizBtn').onclick = function() {
    window.location.href = 'quiz.html';
};