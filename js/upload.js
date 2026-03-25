document.addEventListener('DOMContentLoaded', async () => {
    const dropArea = document.getElementById('dropArea');
    const fileInput = document.getElementById('questionFile');
    const uploadForm = document.getElementById('uploadForm');
    const uploadStatus = document.getElementById('uploadStatus');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const parseResult = document.getElementById('parseResult');
    const toQuizBtn = document.getElementById('toQuizBtn');
    const customPrompt = document.getElementById('customPrompt');
    const parseBtn = document.getElementById('parseBtn');

    // 初始化：隐藏 JSON 预览区域
    parseResult.style.display = 'none';

    let selectedFile = null;
    let currentTaskId = null;
    let lastParsedQuestions = []; // 存储最后一次解析的题目

    // 点击拖拽区域打开文件选择器
    dropArea.addEventListener('click', () => {
        fileInput.click();
    });

    // 文件选择事件
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            selectedFile = e.target.files[0];
            uploadStatus.textContent = `已选择文件：${selectedFile.name}`;
            uploadStatus.style.color = '#059669';
        }
    });

    // 拖拽事件处理
    dropArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropArea.classList.add('drag-over');
    });

    dropArea.addEventListener('dragleave', () => {
        dropArea.classList.remove('drag-over');
    });

    dropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        dropArea.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) {
            selectedFile = e.dataTransfer.files[0];
            fileInput.files = e.dataTransfer.files;
            uploadStatus.textContent = `已选择文件：${selectedFile.name}`;
            uploadStatus.style.color = '#059669';
        }
    });

    // 表单提交
    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!selectedFile) {
            uploadStatus.textContent = '请先选择文件';
            uploadStatus.style.color = '#e74c3c';
            return;
        }

        // 检查文件类型和大小
        if (!selectedFile.name.endsWith('.docx') && !selectedFile.name.endsWith('.pdf') && !selectedFile.name.endsWith('.txt')) {
            uploadStatus.textContent = '仅支持 .docx, .pdf, .txt 文件';
            uploadStatus.style.color = '#e74c3c';
            return;
        }

        if (selectedFile.size > 50 * 1024 * 1024) { // 50MB 限制
            uploadStatus.textContent = '文件过大（50MB以内）';
            uploadStatus.style.color = '#e74c3c';
            return;
        }

        loadingSpinner.style.display = 'block';
        parseResult.style.display = 'none';
        parseResult.textContent = '';
        uploadStatus.textContent = '正在上传并解析...';
        uploadStatus.style.color = '#3b82f6';
        parseBtn.disabled = true;
        toQuizBtn.style.display = 'none';

        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('questionFile', selectedFile);
        formData.append('custom_prompt', customPrompt.value);

        try {
            // 发送上传请求
            const uploadResp = await fetch('/api/ai_upload_question', {
                method: 'POST',
                body: formData
            });

            if (!uploadResp.ok) {
                throw new Error(`上传失败: ${uploadResp.status}`);
            }

            const uploadData = await uploadResp.json();
            if (!uploadData.success) {
                throw new Error(uploadData.error || '上传失败');
            }

            currentTaskId = uploadData.task_id;
            uploadStatus.textContent = '文件已上传，AI正在解析...';

            // 轮询获取进度
            const maxRetries = 120; // 最多等待2分钟
            let retryCount = 0;

            const pollProgress = async () => {
                while (retryCount < maxRetries) {
                    try {
                        const progressResp = await fetch(`/api/ai_upload_progress?task_id=${currentTaskId}`);
                        const progressData = await progressResp.json();

                        if (!progressData.success) {
                            throw new Error('查询进度失败');
                        }

                        if (progressData.status === 'pending') {
                            uploadStatus.textContent = `AI解析中... (${retryCount * 2}s)`;
                            await new Promise(resolve => setTimeout(resolve, 2000));
                            retryCount++;
                        } else if (progressData.status === 'done') {
                            // 解析完成
                            lastParsedQuestions = progressData.result || [];
                            loadingSpinner.style.display = 'none';
                            uploadStatus.textContent = `解析完成！共 ${lastParsedQuestions.length} 题`;
                            uploadStatus.style.color = '#059669';
                            // 隐藏 JSON 预览，只保留去刷题按钮
                            parseResult.style.display = 'none';
                            
                            // 保存到 sessionStorage 便于后续跳转
                            sessionStorage.setItem('quiz_questions', JSON.stringify(lastParsedQuestions));
                            sessionStorage.setItem('quiz_title', selectedFile.name);
                            
                            toQuizBtn.style.display = 'inline-block';
                            break;
                        } else if (progressData.status === 'error') {
                            throw new Error(progressData.error || 'AI解析出错');
                        }
                    } catch (e) {
                        console.error('轮询出错:', e);
                        throw e;
                    }
                }

                if (retryCount >= maxRetries) {
                    throw new Error('解析超时，请重试');
                }
            };

            await pollProgress();
        } catch (error) {
            loadingSpinner.style.display = 'none';
            uploadStatus.textContent = `错误: ${error.message}`;
            uploadStatus.style.color = '#e74c3c';
            parseResult.style.display = 'none';
            parseResult.textContent = '';
        } finally {
            parseBtn.disabled = false;
        }
    });

    // 去刷题按钮
    toQuizBtn.addEventListener('click', () => {
        if (lastParsedQuestions.length > 0) {
            sessionStorage.setItem('quiz_questions', JSON.stringify(lastParsedQuestions));
            sessionStorage.setItem('quiz_title', selectedFile.name);
            window.location.href = 'quiz.html';
        }
    });
});
