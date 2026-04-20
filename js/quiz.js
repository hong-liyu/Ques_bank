document.addEventListener('DOMContentLoaded', async function () {
    const quizTitleHeader = document.getElementById('quizTitleHeader');
    const quizTitleStats = document.getElementById('quizTitleStats');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const questionContentDiv = document.getElementById('questionContent');
    const favoriteBtn = document.getElementById('favoriteBtn');
    const optionsArea = document.getElementById('optionsArea');
    const feedbackArea = document.getElementById('feedbackArea');
    const nextQuestionBtn = document.getElementById('nextQuestionBtn');
    const reviewAllBtn = document.getElementById('reviewAllBtn');
    const submitExamBtn = document.getElementById('submitExamBtn');
    const navigatorGrid = document.getElementById('navigatorGrid');
    const quizPickerModal = document.getElementById('quizPickerModal');
    const quizPickerList = document.getElementById('quizPickerList');
    const quizPickerEmpty = document.getElementById('quizPickerEmpty');
    const quizPickerClose = document.getElementById('quizPickerClose');
    const quizPickerModeSegment = document.getElementById('quizPickerModeSegment');
    const modePickerModal = document.getElementById('modePickerModal');
    const favoriteModal = document.getElementById('favoriteModal');
    const favoriteModalClose = document.getElementById('favoriteModalClose');
    const favoriteFolderInput = document.getElementById('favoriteFolderInput');
    const createFavoriteFolderBtn = document.getElementById('createFavoriteFolderBtn');
    const favoriteFolderList = document.getElementById('favoriteFolderList');
    const favoriteFolderEmpty = document.getElementById('favoriteFolderEmpty');
    const quizCompleteModal = document.getElementById('quizCompleteModal');
    const quizCompleteSummary = document.getElementById('quizCompleteSummary');
    const quizCompleteAccuracy = document.getElementById('quizCompleteAccuracy');
    const quizCompleteScore = document.getElementById('quizCompleteScore');
    const quizCompleteRuns = document.getElementById('quizCompleteRuns');
    const quizCompleteDuration = document.getElementById('quizCompleteDuration');
    const reviewQuizBtn = document.getElementById('reviewQuizBtn');
    const reviewWrongBtn = document.getElementById('reviewWrongBtn');

    const FEEDBACK_DELAY_MS = 500;
    const MODE_PRACTICE = 'practice';
    const MODE_EXAM = 'exam';

    let questions = [];
    let historyItems = [];
    let currentQuestionIndex = 0;
    let answered = false;
    let answerRecord = [];
    let userAnswerRecord = [];
    let currentQuizFile = '';
    let currentQuizTitle = '';
    let currentQuizStats = null;
    let completionSubmitted = false;
    let sessionStartAt = null;
    let answerMode = MODE_PRACTICE;
    let pickerSelectedMode = MODE_PRACTICE;
    let examSubmitted = false;
    let modePickerResolve = null;
    let reviewMode = 'all';

    function getDefaultStats() {
        return {
            completed_runs: 0,
            total_answered: 0,
            total_correct: 0,
            last_completed_at: null
        };
    }

    function normalizeStats(stats) {
        const defaults = getDefaultStats();
        const raw = stats || {};
        return {
            completed_runs: Number.isFinite(Number(raw.completed_runs)) ? Math.max(0, Number(raw.completed_runs)) : defaults.completed_runs,
            total_answered: Number.isFinite(Number(raw.total_answered)) ? Math.max(0, Number(raw.total_answered)) : defaults.total_answered,
            total_correct: Number.isFinite(Number(raw.total_correct)) ? Math.max(0, Number(raw.total_correct)) : defaults.total_correct,
            last_completed_at: raw.last_completed_at || null
        };
    }

    function formatAccuracy(stats) {
        const normalized = normalizeStats(stats);
        if (!normalized.total_answered) return '--';
        return `${Math.round((normalized.total_correct / normalized.total_answered) * 100)}%`;
    }

    function formatDuration(totalSeconds) {
        const seconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainSeconds = seconds % 60;
        if (hours > 0) return `${hours}时${minutes}分${remainSeconds}秒`;
        if (minutes > 0) return `${minutes}分${remainSeconds}秒`;
        return `${remainSeconds}秒`;
    }

    function renderTitleStats() {
        if (!quizTitleStats) return;
        const stats = normalizeStats(currentQuizStats);
        quizTitleStats.innerHTML = `
            <span class="quiz-stat-chip">已刷 ${stats.completed_runs} 次</span>
            <span class="quiz-stat-chip">正确率 ${formatAccuracy(stats)}</span>
        `;
    }

    function setOverlayVisible(element, isOpen, className = 'is-open') {
        if (!element) return;
        element.classList.toggle(className, isOpen);
        element.setAttribute('aria-hidden', (!isOpen).toString());
    }

    function normalizeQuizMode(mode) {
        return mode === MODE_EXAM || mode === MODE_PRACTICE ? mode : '';
    }

    function isExamMode() {
        return answerMode === MODE_EXAM;
    }

    function setAnswerMode(mode) {
        answerMode = normalizeQuizMode(mode) || MODE_PRACTICE;
    }

    function setPickerMode(mode) {
        pickerSelectedMode = normalizeQuizMode(mode) || MODE_PRACTICE;
        if (!quizPickerModeSegment) return;
        quizPickerModeSegment.querySelectorAll('.quiz-mode-option').forEach((button) => {
            button.classList.toggle('is-active', button.dataset.mode === pickerSelectedMode);
        });
    }

    function promptForAnswerMode() {
        setOverlayVisible(modePickerModal, true);
        return new Promise((resolve) => {
            modePickerResolve = resolve;
        });
    }

    function chooseAnswerMode(mode) {
        const normalized = normalizeQuizMode(mode) || MODE_PRACTICE;
        setAnswerMode(normalized);
        setOverlayVisible(modePickerModal, false);
        if (modePickerResolve) {
            modePickerResolve(normalized);
            modePickerResolve = null;
        }
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getHistoryItem(file) {
        return historyItems.find((item) => item.file === file) || null;
    }

    async function fetchHistoryItems() {
        try {
            const resp = await fetch('/api/history_questions?t=' + Date.now());
            const data = await resp.json();
            historyItems = data.success && Array.isArray(data.history) ? data.history : [];
        } catch (error) {
            historyItems = [];
        }
    }

    function renderPickerItems() {
        if (!quizPickerList || !quizPickerEmpty) return;
        quizPickerList.innerHTML = '';
        quizPickerEmpty.style.display = historyItems.length ? 'none' : 'block';

        historyItems.forEach((item) => {
            const title = item.origin_name || item.title || item.file || '未命名题库';
            const stats = normalizeStats(item.stats);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'quiz-picker-item';
            btn.innerHTML = `
                <span class="quiz-picker-item-head">
                    <span class="quiz-picker-item-title">${escapeHtml(title)}</span>
                    <span class="quiz-picker-item-stats">
                        <span class="quiz-stat-chip">已刷 ${stats.completed_runs} 次</span>
                        <span class="quiz-stat-chip">正确率 ${formatAccuracy(stats)}</span>
                    </span>
                </span>
                <span class="quiz-picker-item-meta mono">${escapeHtml(item.time || '未知时间')}</span>
            `;
            btn.onclick = () => {
                if (!item.file) return;
                window.location.href = `quiz.html?file=${encodeURIComponent(item.file)}&title=${encodeURIComponent(title)}&mode=${encodeURIComponent(pickerSelectedMode)}`;
            };
            quizPickerList.appendChild(btn);
        });
    }

    async function openQuizPicker() {
        await fetchHistoryItems();
        renderPickerItems();
        setOverlayVisible(quizPickerModal, true);
    }

    function initMarkdown() {
        if (typeof marked !== 'undefined' && typeof hljs !== 'undefined') {
            marked.setOptions({ breaks: true, gfm: true, pedantic: false, async: false });
            marked.use({
                renderer: {
                    code({ text, lang }) {
                        const highlightedCode = (lang && hljs.getLanguage(lang))
                            ? hljs.highlight(text, { language: lang, ignoreIllegals: true }).value
                            : hljs.highlightAuto(text).value;
                        return `<pre><code class="hljs language-${lang || 'plaintext'}">${highlightedCode}</code></pre>`;
                    },
                    codespan({ text }) {
                        return `<code class="inline-code">${text}</code>`;
                    },
                    paragraph({ text }) {
                        return `<p>${text}</p>`;
                    }
                }
            });
        }
    }

    function parseMarkdown(content) {
        if (typeof marked === 'undefined') return content;
        try {
            let html = marked.parse(content);
            if (content && !content.includes('\n') && !content.match(/```|`/)) {
                html = html.replace(/<p>(.*?)<\/p>/, '$1');
            }
            return html;
        } catch (error) {
            console.warn('Markdown parse error:', error);
            return content;
        }
    }

    function getQuestionPrompt(question) {
        return question.content || question.text || '';
    }

    function getQuestionType(question) {
        return String((question && question.type) || '');
    }

    function isJudgementQuestion(question) {
        return getQuestionType(question).includes('判断');
    }

    function isMultiChoiceQuestion(question) {
        return getQuestionType(question).includes('多选');
    }

    function isFillBlankQuestion(question) {
        return getQuestionType(question).includes('填空');
    }

    function isFreeTextFillQuestion(question) {
        return isFillBlankQuestion(question) && (!Array.isArray(question.options) || question.options.length === 0);
    }

    function getQuestionAnswerText(question) {
        if (isFillBlankQuestion(question) && typeof question.answer === 'string') {
            return question.answer.split('|').map((item) => item.trim()).join(' / ');
        }
        if (typeof question.answer === 'string') return question.answer;
        if (Array.isArray(question.answer)) {
            return question.answer.map((item) => typeof item === 'number' ? String.fromCharCode(65 + item) : item).join(', ');
        }
        return '无';
    }

    function hasStoredUserAnswer(index) {
        const value = userAnswerRecord[index];
        return value !== null && value !== undefined && String(value).trim() !== '';
    }

    function calculateChoiceCorrect(question, selectedValue) {
        if (selectedValue === null || selectedValue === undefined || selectedValue === '') return null;

        if (isJudgementQuestion(question)) {
            return String(selectedValue).toLowerCase() === String(question.answer).toLowerCase();
        }

        if (isMultiChoiceQuestion(question)) {
            const currentValue = parseInt(selectedValue, 10);
            const selectedOptions = [currentValue];
            const answerValues = String(question.answer).split('').map((ch) => ch.charCodeAt(0) - 65);
            return answerValues.length === selectedOptions.length && answerValues.every((idx) => selectedOptions.includes(idx));
        }

        return parseInt(selectedValue, 10) === (String(question.answer).charCodeAt(0) - 65);
    }

    function calculateFillBlankCorrect(question, userAnswer) {
        if (!userAnswer || !String(userAnswer).trim()) return null;
        const trimmed = String(userAnswer).trim();
        const answers = String(question.answer).split('|').map((item) => item.trim());
        return answers.some((ans) => trimmed.toLowerCase() === ans.toLowerCase());
    }

    function calculateStoredAnswerCorrect(question, storedAnswer) {
        if (isFreeTextFillQuestion(question)) {
            return calculateFillBlankCorrect(question, storedAnswer);
        }
        return calculateChoiceCorrect(question, storedAnswer);
    }

    function getCurrentAnsweredCount() {
        return answerRecord.filter((item) => item !== null).length;
    }

    function getCurrentCorrectCount() {
        return answerRecord.filter(Boolean).length;
    }

    function getWrongQuestionIndexes() {
        return answerRecord
            .map((result, index) => result === true ? null : index)
            .filter((index) => index !== null);
    }

    function getReviewQuestionIndexes() {
        return reviewMode === 'wrong' ? getWrongQuestionIndexes() : questions.map((_question, index) => index);
    }

    function getNextReviewIndex(offset) {
        const indexes = getReviewQuestionIndexes();
        if (!indexes.length) return null;
        const currentPosition = indexes.indexOf(currentQuestionIndex);
        if (currentPosition === -1) return indexes[0];
        return indexes[currentPosition + offset] ?? null;
    }

    function resetReviewMode() {
        reviewMode = 'all';
    }

    function enterAllReview(startIndex = 0) {
        reviewMode = 'all';
        setOverlayVisible(quizCompleteModal, false);
        renderQuestion(startIndex);
    }

    function enterWrongReview() {
        const wrongIndexes = getWrongQuestionIndexes();
        if (!wrongIndexes.length) {
            enterAllReview(0);
            return;
        }
        reviewMode = 'wrong';
        setOverlayVisible(quizCompleteModal, false);
        renderQuestion(wrongIndexes[0]);
    }

    async function loadQuizData() {
        const urlParams = new URLSearchParams(window.location.search);
        const fileName = urlParams.get('file');
        const titleFromUrl = urlParams.get('title');
        const requestedMode = normalizeQuizMode(urlParams.get('mode'));

        await fetchHistoryItems();
        await ensureFavoriteCache();

        if (fileName) {
            try {
                const response = await fetch(`/data/parsed/${fileName}`);
                if (!response.ok) throw new Error('无法拉取题库数据');
                questions = await response.json();
                currentQuizFile = fileName;
                const matchedHistory = getHistoryItem(fileName);
                currentQuizTitle = titleFromUrl || (matchedHistory && (matchedHistory.origin_name || matchedHistory.title)) || '题库';
                currentQuizStats = normalizeStats(matchedHistory && matchedHistory.stats);
                quizTitleHeader.textContent = currentQuizTitle;
            } catch (error) {
                console.error(error);
                if (typeof showToast === 'function') showToast('题库加载失败，请返回重试', 'error');
                return;
            }
        } else {
            const stored = sessionStorage.getItem('quiz_questions');
            const storedTitle = sessionStorage.getItem('quiz_title');
            if (!stored) {
                await openQuizPicker();
                return;
            }
            try {
                questions = JSON.parse(stored);
                currentQuizTitle = storedTitle || '本地题库';
                currentQuizStats = normalizeStats();
                quizTitleHeader.textContent = currentQuizTitle;
            } catch (error) {
                if (typeof showToast === 'function') showToast('解析缓存数据失败', 'error');
                return;
            }
        }

        if (requestedMode) {
            setAnswerMode(requestedMode);
        } else {
            await promptForAnswerMode();
        }

        renderTitleStats();

        if (!Array.isArray(questions) || !questions.length) {
            questionContentDiv.innerHTML = '<p style="color:red;">未找到题目数据，请先上传解析或从历史题库进入。</p>';
            optionsArea.innerHTML = '';
            return;
        }

        answerRecord = new Array(questions.length).fill(null);
        userAnswerRecord = new Array(questions.length).fill(null);
        completionSubmitted = false;
        examSubmitted = false;
        resetReviewMode();
        sessionStartAt = null;
        updateNavigatorSidebar();
        renderQuestion(0);
    }

    function updateProgressBar() {
        const progress = questions.length > 0 ? ((currentQuestionIndex + 1) / questions.length) * 100 : 0;
        progressBar.style.width = `${progress}%`;
        progressText.textContent = `Question ${currentQuestionIndex + 1} of ${questions.length}`;
    }

    function createOptionButton(value, text, question) {
        const button = document.createElement('button');
        button.className = 'option-btn';
        button.textContent = text;
        button.dataset.value = value;
        button.onclick = () => handleAnswer(button, question);
        optionsArea.appendChild(button);
    }

    function createFillBlankInput(question) {
        const inputContainer = document.createElement('div');
        inputContainer.className = 'fill-blank-container';

        const label = document.createElement('label');
        label.htmlFor = 'fillBlankInput';
        label.textContent = '请输入答案：';

        const input = document.createElement('input');
        input.type = 'text';
        input.id = 'fillBlankInput';
        input.className = 'fill-blank-input';
        input.placeholder = '输入你的答案...';

        const submitBtn = document.createElement('button');
        submitBtn.type = 'button';
        submitBtn.className = 'option-btn fill-blank-submit';
        submitBtn.textContent = isExamMode() && !examSubmitted ? '保存答案' : '提交答案';
        submitBtn.onclick = (e) => {
            e.preventDefault();
            handleFillBlankAnswer(input.value, question, submitBtn);
        };

        if (isExamMode()) {
            input.value = userAnswerRecord[currentQuestionIndex] || '';
            input.addEventListener('input', () => {
                userAnswerRecord[currentQuestionIndex] = input.value;
                updateNavigatorSidebar();
            });
        }

        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') submitBtn.click();
        });

        inputContainer.appendChild(label);
        inputContainer.appendChild(input);
        inputContainer.appendChild(submitBtn);
        optionsArea.appendChild(inputContainer);
        setTimeout(() => input.focus(), 100);
    }

    function updateFavoriteBtn(question) {
        favoriteBtn.classList.toggle('bookmarked', isFavorite(question, getFavoriteItems()));
    }

    function getStoredChoiceButton(index) {
        const value = userAnswerRecord[index];
        if (value === null || value === undefined || value === '') return null;
        return optionsArea.querySelector(`[data-value="${String(value)}"]`);
    }

    function markStoredChoice(index) {
        optionsArea.querySelectorAll('.option-btn').forEach((btn) => {
            btn.classList.remove('selected', 'exam-selected');
        });
        const selectedButton = getStoredChoiceButton(index);
        if (selectedButton) selectedButton.classList.add('selected', 'exam-selected');
    }

    function showFillBlankResult(isCorrect) {
        const input = document.getElementById('fillBlankInput');
        const submitBtn = optionsArea.querySelector('.fill-blank-submit');
        if (input) input.style.borderColor = isCorrect ? '#10b981' : '#ef4444';
        if (submitBtn) submitBtn.classList.add(isCorrect ? 'correct-answer' : 'incorrect-answer');
    }

    function renderQuestion(index) {
        if (index < 0 || index >= questions.length) return;

        if (!sessionStartAt) {
            sessionStartAt = Date.now();
        }

        currentQuestionIndex = index;
        answered = isExamMode() ? false : answerRecord[index] !== null;
        feedbackArea.innerHTML = '';
        nextQuestionBtn.style.display = 'none';
        reviewAllBtn.style.display = reviewMode === 'wrong' ? 'inline-flex' : 'none';
        submitExamBtn.style.display = isExamMode() && !examSubmitted ? 'inline-flex' : 'none';
        optionsArea.innerHTML = '';

        updateProgressBar();
        updateNavigatorSidebar();

        const question = questions[index];
        questionContentDiv.innerHTML = `<span class="question-text">${index + 1}. ${parseMarkdown(getQuestionPrompt(question))}</span>`;
        updateFavoriteBtn(question);

        if (isJudgementQuestion(question)) {
            createOptionButton('True', '正确', question);
            createOptionButton('False', '错误', question);
        } else if (isFillBlankQuestion(question)) {
            if (Array.isArray(question.options) && question.options.length > 0) {
                question.options.forEach((opt, optionIndex) => createOptionButton(optionIndex, `${opt}`, question));
            } else {
                createFillBlankInput(question);
            }
        } else if (Array.isArray(question.options) && question.options.length > 0) {
            question.options.forEach((opt, optionIndex) => createOptionButton(optionIndex, `${opt}`, question));
        } else {
            optionsArea.innerHTML = '<span style="color:#e74c3c;">本题无选项</span>';
        }

        if (isExamMode()) {
            if (isFreeTextFillQuestion(question)) {
                const input = document.getElementById('fillBlankInput');
                if (input) input.value = userAnswerRecord[index] || '';
            } else {
                markStoredChoice(index);
            }

            if (examSubmitted) {
                if (answerRecord[index] !== null) {
                    showFeedback(question, answerRecord[index], getStoredChoiceButton(index));
                    if (isFreeTextFillQuestion(question)) showFillBlankResult(answerRecord[index]);
                } else {
                    showFeedback(question, false, null);
                    feedbackArea.innerHTML = `<span class="incorrect-feedback">未作答，正确答案：${escapeHtml(getQuestionAnswerText(question))}</span>`;
                }
                disableOptions();
                if (getNextReviewIndex(1) !== null) nextQuestionBtn.style.display = 'inline-flex';
                return;
            }

            if (getNextReviewIndex(1) !== null) nextQuestionBtn.style.display = 'inline-flex';
            return;
        }

        if (answerRecord[index] !== null) {
            showFeedback(question, answerRecord[index], getStoredChoiceButton(index));
            disableOptions();
            if (getNextReviewIndex(1) !== null) nextQuestionBtn.style.display = 'inline-flex';
        }
    }

    function disableOptions() {
        optionsArea.querySelectorAll('.option-btn').forEach((btn) => {
            btn.disabled = true;
        });
        const fillInput = document.getElementById('fillBlankInput');
        if (fillInput) fillInput.disabled = true;
    }

    function appendStateIcon(button, type) {
        if (!button || button.querySelector('svg')) return;
        const icon = type === 'correct'
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>'
            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
        button.insertAdjacentHTML('beforeend', ` ${icon}`);
    }

    function showFeedback(question, isCorrect, selectedButton = null) {
        optionsArea.querySelectorAll('.option-btn').forEach((btn) => {
            btn.classList.remove('selected');
            btn.disabled = true;
        });
        feedbackArea.innerHTML = '';

        if (isCorrect) {
            if (selectedButton) {
                selectedButton.classList.add('correct-answer');
                appendStateIcon(selectedButton, 'correct');
            }
            return;
        }

        feedbackArea.innerHTML = `<span class="incorrect-feedback">正确答案：${escapeHtml(getQuestionAnswerText(question))}</span>`;

        if (selectedButton) {
            selectedButton.classList.add('incorrect-answer');
            appendStateIcon(selectedButton, 'incorrect');
        }

        if (isJudgementQuestion(question)) {
            const correctBtn = optionsArea.querySelector(`[data-value="${String(question.answer)}"]`);
            if (correctBtn) {
                correctBtn.classList.add('correct-answer');
                appendStateIcon(correctBtn, 'correct');
            }
        } else if (isMultiChoiceQuestion(question)) {
            const answers = String(question.answer).split('').map((ch) => ch.charCodeAt(0) - 65);
            answers.forEach((correctIndex) => {
                const correctBtn = optionsArea.querySelector(`[data-value="${correctIndex}"]`);
                if (correctBtn) {
                    correctBtn.classList.add('correct-answer');
                    appendStateIcon(correctBtn, 'correct');
                }
            });
        } else if (!isFillBlankQuestion(question)) {
            const correctIndex = String(question.answer).charCodeAt(0) - 65;
            const correctBtn = optionsArea.querySelector(`[data-value="${correctIndex}"]`);
            if (correctBtn) {
                correctBtn.classList.add('correct-answer');
                appendStateIcon(correctBtn, 'correct');
            }
        }
    }

    async function onQuestionCompleted() {
        if (getNextReviewIndex(1) !== null) {
            setTimeout(() => {
                nextQuestionBtn.style.display = 'inline-flex';
            }, FEEDBACK_DELAY_MS);
            return;
        }
        await completeQuizSession();
    }

    async function handleAnswer(selectedButton, question) {
        if (isExamMode() && !examSubmitted) {
            userAnswerRecord[currentQuestionIndex] = selectedButton.dataset.value;
            markStoredChoice(currentQuestionIndex);
            updateNavigatorSidebar();
            return;
        }

        if (answered) return;
        answered = true;
        disableOptions();

        const selectedValue = selectedButton.dataset.value;
        const isCorrect = calculateChoiceCorrect(question, selectedValue);

        userAnswerRecord[currentQuestionIndex] = selectedValue;
        answerRecord[currentQuestionIndex] = isCorrect;
        showFeedback(question, isCorrect, selectedButton);
        updateNavigatorSidebar();
        await onQuestionCompleted();
    }

    async function handleFillBlankAnswer(userAnswer, question, submitBtn) {
        if (isExamMode() && !examSubmitted) {
            userAnswerRecord[currentQuestionIndex] = userAnswer || '';
            updateNavigatorSidebar();
            if (typeof showToast === 'function') showToast('答案已保存', 'success');
            return;
        }

        if (answered) return;
        if (!userAnswer || !userAnswer.trim()) {
            alert('请输入答案');
            return;
        }

        answered = true;
        const input = document.getElementById('fillBlankInput');
        const trimmed = userAnswer.trim();
        const answers = String(question.answer).split('|').map((item) => item.trim());
        const isCorrect = calculateFillBlankCorrect(question, trimmed);

        if (input) {
            input.disabled = true;
            input.style.borderColor = isCorrect ? '#10b981' : '#ef4444';
        }
        submitBtn.disabled = true;
        submitBtn.classList.add(isCorrect ? 'correct-answer' : 'incorrect-answer');

        userAnswerRecord[currentQuestionIndex] = trimmed;
        answerRecord[currentQuestionIndex] = isCorrect;
        feedbackArea.innerHTML = isCorrect ? '' : `<span class="incorrect-feedback">正确答案：${escapeHtml(answers.join(' / '))}</span>`;
        updateNavigatorSidebar();
        await onQuestionCompleted();
    }

    async function submitExam() {
        if (!isExamMode() || examSubmitted) return;

        examSubmitted = true;
        answerRecord = questions.map((question, index) => calculateStoredAnswerCorrect(question, userAnswerRecord[index]));
        submitExamBtn.style.display = 'none';
        updateNavigatorSidebar();
        renderQuestion(currentQuestionIndex);
        await completeQuizSession();
    }

    async function completeQuizSession() {
        if (completionSubmitted) return;
        completionSubmitted = true;

        const answeredCount = getCurrentAnsweredCount();
        const correctCount = getCurrentCorrectCount();
        const durationSeconds = Math.max(0, Math.round(((Date.now() - (sessionStartAt || Date.now())) / 1000)));
        let updatedStats = normalizeStats(currentQuizStats);

        if (currentQuizFile) {
            try {
                const resp = await fetch('/api/quiz_session_complete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        file: currentQuizFile,
                        answered_count: answeredCount,
                        correct_count: correctCount,
                        completed_at: new Date().toISOString(),
                        duration_seconds: durationSeconds
                    })
                });
                const data = await resp.json();
                if (data.success && data.stats) {
                    updatedStats = normalizeStats(data.stats);
                }
            } catch (error) {
                console.error('quiz completion sync failed', error);
            }
        }

        currentQuizStats = updatedStats;
        renderTitleStats();
        showCompletionModal(correctCount, answeredCount, updatedStats, durationSeconds);
    }

    function showCompletionModal(correctCount, answeredCount, updatedStats, durationSeconds) {
        const accuracy = answeredCount ? Math.round((correctCount / answeredCount) * 100) : 0;
        const wrongCount = getWrongQuestionIndexes().length;
        quizCompleteSummary.textContent = `${currentQuizTitle || '本题库'} 已完成，本轮共答 ${answeredCount} 题。`;
        quizCompleteAccuracy.textContent = `${accuracy}%`;
        quizCompleteScore.textContent = `${correctCount} / ${answeredCount}`;
        quizCompleteRuns.textContent = `${normalizeStats(updatedStats).completed_runs} 次`;
        quizCompleteDuration.textContent = formatDuration(durationSeconds);
        if (reviewWrongBtn) {
            reviewWrongBtn.disabled = wrongCount === 0;
            reviewWrongBtn.textContent = wrongCount ? `回顾错题（${wrongCount}）` : '没有错题';
        }
        setOverlayVisible(quizCompleteModal, true);
    }

    async function renderFavoriteFolderList() {
        await ensureFavoriteCache();
        favoriteFolderList.innerHTML = '';
        const folders = getFavoriteFolders();
        const question = questions[currentQuestionIndex];
        const entries = getQuestionFavoriteEntries(question);
        favoriteFolderEmpty.style.display = folders.length ? 'none' : 'block';

        folders.forEach((folder) => {
            const matchedEntry = entries.find((entry) => entry.folder_id === folder.id);
            const row = document.createElement('button');
            row.type = 'button';
            row.className = `favorite-folder-item${matchedEntry ? ' is-active' : ''}`;
            row.innerHTML = `
                <span class="favorite-folder-main">
                    <span class="favorite-folder-name">${escapeHtml(folder.name)}</span>
                    <span class="favorite-folder-count">${folder.count || 0} 题</span>
                </span>
                <span class="favorite-folder-action">${matchedEntry ? '移除' : '添加'}</span>
            `;
            row.onclick = async () => {
                try {
                    if (matchedEntry) {
                        await removeFavorite(question, folder.id, matchedEntry.id);
                        if (typeof showToast === 'function') showToast(`已从 ${folder.name} 移除`, 'success');
                    } else {
                        await addFavorite(question, folder.id, {
                            source_file: currentQuizFile,
                            source_title: currentQuizTitle
                        });
                        if (typeof showToast === 'function') showToast(`已收藏到 ${folder.name}`, 'success');
                    }
                    await refreshFavoriteCache();
                    updateFavoriteBtn(question);
                    updateNavigatorSidebar();
                    await renderFavoriteFolderList();
                } catch (error) {
                    if (typeof showToast === 'function') showToast(error.message || '收藏操作失败', 'error');
                }
            };
            favoriteFolderList.appendChild(row);
        });
    }

    async function openFavoriteModal() {
        await refreshFavoriteCache().catch(() => ensureFavoriteCache());
        await renderFavoriteFolderList();
        setOverlayVisible(favoriteModal, true);
        if (favoriteFolderInput) favoriteFolderInput.value = '';
    }

    function updateNavigatorSidebar() {
        navigatorGrid.innerHTML = '';
        const favoriteItems = getFavoriteItems();

        questions.forEach((question, index) => {
            if (reviewMode === 'wrong' && answerRecord[index] === true) return;
            const item = document.createElement('div');
            item.className = 'navigator-item';
            item.textContent = index + 1;
            if (index === currentQuestionIndex) item.classList.add('current');
            else if (isExamMode() && !examSubmitted && hasStoredUserAnswer(index)) item.classList.add('answered');
            else if (answerRecord[index] === true) item.classList.add('correct');
            else if (answerRecord[index] === false) item.classList.add('incorrect');
            if (isFavorite(question, favoriteItems)) item.classList.add('bookmarked');
            item.onclick = () => renderQuestion(index);
            navigatorGrid.appendChild(item);
        });
    }

    initMarkdown();

    favoriteBtn.onclick = async function () {
        if (!questions[currentQuestionIndex]) return;
        await openFavoriteModal();
    };

    if (favoriteModalClose) {
        favoriteModalClose.addEventListener('click', () => setOverlayVisible(favoriteModal, false));
    }

    if (createFavoriteFolderBtn) {
        createFavoriteFolderBtn.addEventListener('click', async () => {
            const folderName = (favoriteFolderInput.value || '').trim();
            if (!folderName) {
                if (typeof showToast === 'function') showToast('请输入收藏夹名称', 'error');
                return;
            }
            try {
                await createFavoriteFolder(folderName);
                await refreshFavoriteCache();
                favoriteFolderInput.value = '';
                await renderFavoriteFolderList();
                if (typeof showToast === 'function') showToast(`收藏夹 ${folderName} 已创建`, 'success');
            } catch (error) {
                if (typeof showToast === 'function') showToast(error.message || '创建收藏夹失败', 'error');
            }
        });
    }

    if (quizPickerClose) {
        quizPickerClose.addEventListener('click', () => setOverlayVisible(quizPickerModal, false));
    }

    if (quizPickerModeSegment) {
        quizPickerModeSegment.querySelectorAll('.quiz-mode-option').forEach((button) => {
            button.addEventListener('click', () => setPickerMode(button.dataset.mode));
        });
        setPickerMode(pickerSelectedMode);
    }

    if (modePickerModal) {
        modePickerModal.querySelectorAll('.mode-picker-option').forEach((button) => {
            button.addEventListener('click', () => chooseAnswerMode(button.dataset.mode));
        });
    }

    if (submitExamBtn) {
        submitExamBtn.addEventListener('click', () => {
            submitExam();
        });
    }

    if (reviewQuizBtn) {
        reviewQuizBtn.addEventListener('click', () => {
            enterAllReview(0);
        });
    }

    if (reviewWrongBtn) {
        reviewWrongBtn.addEventListener('click', () => {
            enterWrongReview();
        });
    }

    if (reviewAllBtn) {
        reviewAllBtn.addEventListener('click', () => {
            enterAllReview(currentQuestionIndex);
        });
    }

    nextQuestionBtn.onclick = function () {
        const nextIndex = getNextReviewIndex(1);
        if (nextIndex !== null) renderQuestion(nextIndex);
    };

    document.onkeydown = function (e) {
        if (
            !questions.length ||
            favoriteModal.classList.contains('is-open') ||
            quizCompleteModal.classList.contains('is-open') ||
            quizPickerModal.classList.contains('is-open') ||
            modePickerModal.classList.contains('is-open')
        ) return;

        const activeElement = document.activeElement;
        if (activeElement && (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.contentEditable === 'true'
        )) return;

        const question = questions[currentQuestionIndex];
        const key = e.key.toUpperCase();

        if (key === 'ENTER' || key === ' ') {
            e.preventDefault();
            if (nextQuestionBtn.style.display !== 'none') {
                nextQuestionBtn.click();
            }
        } else if (key === 'R') {
            e.preventDefault();
            favoriteBtn.click();
        } else if (key === 'Q') {
            e.preventDefault();
            const previousIndex = getNextReviewIndex(-1);
            if (previousIndex !== null) renderQuestion(previousIndex);
        } else if (key === 'E') {
            e.preventDefault();
            const nextIndex = getNextReviewIndex(1);
            if (nextIndex !== null) renderQuestion(nextIndex);
        } else if ((isExamMode() || !answered) && !examSubmitted && !isFreeTextFillQuestion(question)) {
            if (isJudgementQuestion(question)) {
                if (key === 'A') optionsArea.querySelector('[data-value="True"]')?.click();
                if (key === 'D') optionsArea.querySelector('[data-value="False"]')?.click();
            } else {
                const keyMap = { W: 0, A: 1, S: 2, D: 3 };
                if (key in keyMap) {
                    const optionButton = optionsArea.querySelector(`[data-value="${keyMap[key]}"]`);
                    optionButton?.click();
                }
            }
        }
    };

    await loadQuizData();
});
