document.addEventListener('DOMContentLoaded', async () => {
    const dropArea = document.getElementById('dropArea');
    const fileInput = document.getElementById('questionFile');
    const fileInfo = document.getElementById('fileInfo');
    const renameInline = document.getElementById('renameInline');
    const customNameInput = document.getElementById('customName');
    const nameDuplicateHint = document.getElementById('nameDuplicateHint');

    const uploadForm = document.getElementById('uploadForm');
    const uploadStatus = document.getElementById('uploadStatus');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const parseResult = document.getElementById('parseResult');
    const toQuizBtn = document.getElementById('toQuizBtn');
    const customPrompt = document.getElementById('customPrompt');
    const parseBtn = document.getElementById('parseBtn');

    const progressContainer = document.getElementById('progressContainer');
    const progressFill = document.getElementById('progressFill');
    const progressPercent = document.getElementById('progressPercent');
    const progressMsg = document.getElementById('progressMsg');

    let selectedFile = null;
    let currentTaskId = null;
    let lastParsedQuestions = [];
    let currentDisplayName = '';
    let existingNameSet = new Set();

    if (parseResult) parseResult.style.display = 'none';

    function setStatus(message, color = '#3b82f6') {
        if (!uploadStatus) return;
        uploadStatus.textContent = message;
        uploadStatus.style.color = color;
    }

    function formatFileSize(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    function normalizeComparableName(value) {
        return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
    }

    function getDefaultName(file) {
        return (file && file.name ? file.name : '题库').replace(/\.[^/.]+$/, '').trim();
    }

    function normalizeName(inputValue) {
        const fallback = selectedFile ? getDefaultName(selectedFile) : '题库';
        const cleaned = String(inputValue || '').trim().replace(/\s+/g, ' ');
        return (cleaned || fallback).slice(0, 40);
    }

    async function loadExistingNames() {
        try {
            const resp = await fetch(`/api/history_questions?t=${Date.now()}`);
            const data = await resp.json();
            if (!data.success || !Array.isArray(data.history)) return;

            const names = [];
            data.history.forEach((item) => {
                if (!item) return;
                names.push(item.origin_name || item.title || '');
                if (item.file) names.push(String(item.file).replace(/\.[^/.]+$/, ''));
            });

            existingNameSet = new Set(
                names.map((n) => normalizeComparableName(n)).filter(Boolean)
            );
        } catch (_error) {
            existingNameSet = new Set();
        }
    }

    function updateDuplicateHint() {
        if (!customNameInput || !nameDuplicateHint) return;

        const comparable = normalizeComparableName(customNameInput.value);
        if (!comparable) {
            nameDuplicateHint.hidden = true;
            nameDuplicateHint.textContent = '';
            return;
        }

        if (existingNameSet.has(comparable)) {
            nameDuplicateHint.hidden = false;
            nameDuplicateHint.textContent = '名称与历史题库重复，保存后在历史页可能出现同名项。';
            nameDuplicateHint.classList.add('is-warning');
        } else {
            nameDuplicateHint.hidden = false;
            nameDuplicateHint.textContent = '名称可用。';
            nameDuplicateHint.classList.remove('is-warning');
        }
    }

    function setSelectedFile(file) {
        selectedFile = file;
        if (!selectedFile) return;

        const ext = (selectedFile.name.split('.').pop() || '').toLowerCase();
        if (fileInfo) {
            fileInfo.textContent = `已选择: ${selectedFile.name} · ${formatFileSize(selectedFile.size)} · ${ext.toUpperCase()}`;
        }

        if (renameInline && customNameInput) {
            renameInline.hidden = false;
            customNameInput.value = getDefaultName(selectedFile);
            updateDuplicateHint();
        }

        setStatus(`已选择文件: ${selectedFile.name}`, '#059669');
    }

    if (customNameInput) {
        customNameInput.addEventListener('input', updateDuplicateHint);
        customNameInput.addEventListener('blur', () => {
            customNameInput.value = normalizeName(customNameInput.value);
            updateDuplicateHint();
        });
    }

    if (dropArea && fileInput) {
        dropArea.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                setSelectedFile(e.target.files[0]);
            }
        });

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
            if (!e.dataTransfer.files || !e.dataTransfer.files.length) return;
            setSelectedFile(e.dataTransfer.files[0]);
            fileInput.files = e.dataTransfer.files;
        });
    }

    async function startUpload(displayName) {
        loadingSpinner.style.display = 'block';

        if (parseResult) {
            parseResult.style.display = 'none';
            parseResult.textContent = '';
        }

        progressContainer.style.display = 'block';
        progressFill.style.width = '0%';
        progressPercent.textContent = '0%';
        progressMsg.textContent = '准备上传...';

        setStatus('正在上传...', '#3b82f6');
        parseBtn.disabled = true;
        toQuizBtn.style.display = 'none';

        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('questionFile', selectedFile);
        formData.append('custom_prompt', customPrompt ? customPrompt.value : '');
        formData.append('custom_name', displayName);

        try {
            const uploadResp = await fetch('/api/ai_upload_question', {
                method: 'POST',
                body: formData
            });

            if (!uploadResp.ok) throw new Error(`上传失败: ${uploadResp.status}`);

            const uploadData = await uploadResp.json();
            if (!uploadData.success) throw new Error(uploadData.error || '上传失败');

            currentTaskId = uploadData.task_id;
            setStatus('任务已创建，排队中...', '#3b82f6');
            progressFill.style.width = '5%';
            progressPercent.textContent = '5%';
            progressMsg.textContent = '排队中...';

            const maxRetries = 180;
            let retryCount = 0;
            let currentFakePercent = 5;
            let targetPercent = 5;

            const tweenPercent = setInterval(() => {
                if (currentFakePercent < targetPercent) {
                    currentFakePercent += 1;
                    progressFill.style.width = `${currentFakePercent}%`;
                    progressPercent.textContent = `${currentFakePercent}%`;
                }
            }, 100);

            while (retryCount < maxRetries) {
                const progressResp = await fetch(`/api/ai_upload_progress?task_id=${currentTaskId}`);
                const progressData = await progressResp.json();

                if (!progressData.success) {
                    clearInterval(tweenPercent);
                    throw new Error('查询进度失败');
                }

                if (typeof progressData.percent === 'number') {
                    targetPercent = Math.max(targetPercent, progressData.percent);
                }

                if (progressData.msg) {
                    progressMsg.textContent = progressData.msg;
                }

                if (progressData.status === 'pending') {
                    if (targetPercent < 85) targetPercent = Math.min(85, targetPercent + 2);
                    setStatus(`解析中... (${Math.floor(retryCount * 1.5)}s)`, '#3b82f6');
                    await new Promise((resolve) => setTimeout(resolve, 1500));
                    retryCount += 1;
                    continue;
                }

                if (progressData.status === 'done') {
                    clearInterval(tweenPercent);
                    progressFill.style.width = '100%';
                    progressPercent.textContent = '100%';
                    progressMsg.textContent = '解析完成';

                    lastParsedQuestions = progressData.result || [];
                    loadingSpinner.style.display = 'none';
                    setStatus(`解析完成，共 ${lastParsedQuestions.length} 题`, '#059669');

                    try {
                        sessionStorage.setItem('quiz_questions', JSON.stringify(lastParsedQuestions));
                        sessionStorage.setItem('quiz_title', displayName || selectedFile.name);
                    } catch (err) {
                        console.warn('题目过大，无法写入 sessionStorage', err);
                    }

                    toQuizBtn.style.display = 'inline-flex';
                    return;
                }

                if (progressData.status === 'error') {
                    clearInterval(tweenPercent);
                    throw new Error(progressData.error || 'AI解析出错');
                }
            }

            throw new Error('解析超时，请重试');
        } catch (error) {
            loadingSpinner.style.display = 'none';
            progressFill.style.background = '#ef4444';
            progressMsg.textContent = '任务中断或报错';
            setStatus(`错误: ${error.message}`, '#e74c3c');

            if (parseResult) {
                parseResult.style.display = 'none';
                parseResult.textContent = '';
            }
        } finally {
            parseBtn.disabled = false;
        }
    }

    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!selectedFile) {
            setStatus('请先选择文件', '#e74c3c');
            return;
        }

        const lowerName = selectedFile.name.toLowerCase();
        const isAllowed = lowerName.endsWith('.docx') || lowerName.endsWith('.pdf') || lowerName.endsWith('.txt');
        if (!isAllowed) {
            setStatus('仅支持 .docx、.pdf、.txt 文件', '#e74c3c');
            return;
        }

        if (selectedFile.size > 50 * 1024 * 1024) {
            setStatus('文件过大，请控制在 50MB 以内', '#e74c3c');
            return;
        }

        currentDisplayName = normalizeName(customNameInput ? customNameInput.value : '');
        if (customNameInput) {
            customNameInput.value = currentDisplayName;
            updateDuplicateHint();
        }

        await startUpload(currentDisplayName);
    });

    toQuizBtn.addEventListener('click', () => {
        if (!lastParsedQuestions.length) return;

        sessionStorage.setItem('quiz_questions', JSON.stringify(lastParsedQuestions));
        sessionStorage.setItem('quiz_title', currentDisplayName || (selectedFile ? selectedFile.name : '题库'));
        window.location.href = 'quiz.html';
    });

    await loadExistingNames();
});