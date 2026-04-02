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

    // 进度条相关元素
    const progressContainer = document.getElementById('progressContainer');
    const progressFill = document.getElementById('progressFill');
    const progressPercent = document.getElementById('progressPercent');
    const progressMsg = document.getElementById('progressMsg');

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
        progressContainer.style.display = 'block';
        progressFill.style.width = '0%';
        progressPercent.textContent = '0%';
        progressMsg.textContent = '准备上传...';

        uploadStatus.textContent = '正在上传...';
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
            uploadStatus.textContent = '任务已建立，排队中...';
            progressFill.style.width = '5%';
            progressPercent.textContent = '5%';
            progressMsg.textContent = '排队中...';

            // 轮询获取进度
            const maxRetries = 180; // 适当放宽时间到大概3分钟
            let retryCount = 0;
            // Fake progress variables to animate smoothly between actual state updates
            let currentFakePercent = 5;
            let targetPercent = 5;

            // Simple tweening function for smoothly animating percentage
            const tweenPercent = setInterval(() => {
                if(currentFakePercent < targetPercent) {
                    currentFakePercent++;
                    progressFill.style.width = `${currentFakePercent}%`;
                    progressPercent.textContent = `${currentFakePercent}%`;
                }
            }, 100);

            const pollProgress = async () => {
                while (retryCount < maxRetries) {
                    try {
                        const progressResp = await fetch(`/api/ai_upload_progress?task_id=${currentTaskId}`);
                        const progressData = await progressResp.json();

                        if (!progressData.success) {
                            throw new Error('查询进度失败');
                        }
                        
                        // Backend actually sets `percent` and `msg` now
                        if(progressData.percent) {
                            targetPercent = Math.max(targetPercent, progressData.percent);
                        }
                        if(progressData.msg) {
                            progressMsg.textContent = progressData.msg;
                        }

                        if (progressData.status === 'pending') {
                            // Automatically slowly increase fake target when stuck pending (up to 85% for deepseek parsing step)
                            if (targetPercent === 30) {
                                // Simulate ai parsing time
                                targetPercent = Math.min(85, targetPercent + 2);
                            }
                            
                            uploadStatus.textContent = `解析中... (${Math.floor(retryCount * 1.5)}s)`;
                            await new Promise(resolve => setTimeout(resolve, 1500));
                            retryCount++;
                        } else if (progressData.status === 'done') {
                            // 解析完成
                            clearInterval(tweenPercent);
                            progressFill.style.width = '100%';
                            progressPercent.textContent = '100%';
                            progressMsg.textContent = '解析完毕！';
                            
                            lastParsedQuestions = progressData.result || [];
                            loadingSpinner.style.display = 'none';
                            uploadStatus.textContent = `解析完成！共 ${lastParsedQuestions.length} 题`;
                            uploadStatus.style.color = '#059669';
                            // 隐藏 JSON 预览，只保留去刷题按钮
                            parseResult.style.display = 'none';
                            
                            // 更新：如果题目数量少且不需要存大文件，可以直接继续传，
                            // 但为了统一及规避内存满，我们建议尽量向前端暴露一个可以访问的文件路径
                            // 因为 /api/ai_upload_question 只有 task_id 返回却没有具体的 filename 给前端...
                            // 这里我们暂时仍将本次 AI 解析刚返回的结果作为备用回落存入 Session (因为前端直接拿到了 result array),
                            // 但清理冗余项。
                            try {
                                sessionStorage.setItem('quiz_questions', JSON.stringify(lastParsedQuestions));
                                sessionStorage.setItem('quiz_title', selectedFile.name);
                            } catch (err) {
                                console.warn('文件可能过大，无法存入 sessionStorage，请在历史库中查看！', err);
                            }
                            
                            toQuizBtn.style.display = 'inline-flex';
                            break;
                        } else if (progressData.status === 'error') {
                            throw new Error(progressData.error || 'AI解析出错');
                        }
                    } catch (e) {
                        clearInterval(tweenPercent);
                        console.error('轮询出错:', e);
                        throw e;
                    }
                }

                if (retryCount >= maxRetries) {
                    clearInterval(tweenPercent);
                    throw new Error('解析超时，请重试');
                }
            };

            await pollProgress();
        } catch (error) {
            loadingSpinner.style.display = 'none';
            // Stop processing progress smoothly
            progressFill.style.background = '#ef4444'; 
            progressMsg.textContent = '任务中断或报错...';
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
