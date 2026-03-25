document.addEventListener('DOMContentLoaded', async function() {
    const quizTitleHeader = document.getElementById('quizTitleHeader');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const questionContentDiv = document.getElementById('questionContent');
    const favoriteBtn = document.getElementById('favoriteBtn');
    const optionsArea = document.getElementById('optionsArea');
    const feedbackArea = document.getElementById('feedbackArea');
    const nextQuestionBtn = document.getElementById('nextQuestionBtn');
    const navigatorGrid = document.getElementById('navigatorGrid');

    let questions = []; // Main questions array
    let currentQuestionIndex = 0;
    let answered = false;
    let answerRecord = []; // Stores true for correct, false for incorrect, null for unanswered

    // ===== Markdown 和代码高亮配置 =====
    // 初始化 marked 配置
    function initMarkdown() {
        if (typeof marked !== 'undefined' && typeof hljs !== 'undefined') {
            // 配置 marked 选项
            marked.setOptions({
                breaks: true,
                gfm: true,
                pedantic: false,
                async: false
            });
            
            // 自定义渲染器
            const renderer = {
                code({text, lang, escaped}) {
                    const highlightedCode = (lang && hljs.getLanguage(lang))
                        ? hljs.highlight(text, { language: lang, ignoreIllegals: true }).value
                        : hljs.highlightAuto(text).value;
                    return `<pre><code class="hljs language-${lang || 'plaintext'}">${highlightedCode}</code></pre>`;
                },
                codespan({text}) {
                    return `<code class="inline-code">${text}</code>`;
                },
                paragraph({text}) {
                    return `<p>${text}</p>`;
                }
            };
            
            marked.use({ renderer });
        }
    }
    
    // 处理 Markdown 内容
    function parseMarkdown(content) {
        if (typeof marked === 'undefined') return content;
        try {
            let html = marked.parse(content);
            // 清理多余的 <p> 标签包装（单行内容）
            if (content && !content.includes('\n') && !content.match(/```|`/)) {
                html = html.replace(/<p>(.*?)<\/p>/, '$1');
            }
            return html;
        } catch (error) {
            console.warn('Markdown 解析错误:', error);
            return content;
        }
    }
    
    // 页面加载时初始化
    initMarkdown();

    // Load favorite.js if not already loaded (though it should be in HTML)
    if (typeof getLocalFavorites === 'undefined') {
        const script = document.createElement('script');
        script.src = 'js/favorite.js';
        document.head.appendChild(script);
    }

    function shuffleArray(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }

    function updateProgressBar() {
        const progress = questions.length > 0 ? ((currentQuestionIndex + 1) / questions.length) * 100 : 0;
        progressBar.style.width = `${progress}%`;
        progressText.textContent = `Question ${currentQuestionIndex + 1} of ${questions.length}`;
    }

    function renderQuestion(idx) {
        if (idx < 0 || idx >= questions.length) return;

        currentQuestionIndex = idx;
        answered = false;
        feedbackArea.innerHTML = '';
        nextQuestionBtn.style.display = 'none';
        optionsArea.innerHTML = ''; // Clear previous options

        updateProgressBar();
        updateNavigatorSidebar();

        const q = questions[idx];
        // 使用 Markdown 解析问题内容
        const questionHTML = parseMarkdown(q.content || q.text || '');
        questionContentDiv.innerHTML = `<span class="question-text">${idx + 1}. ${questionHTML}</span>`;

        // Update favorite button state
        updateFavoriteBtn(q);

        // Render options
        if (q.type === '判断') {
            createOptionButton('True', '正确', q);
            createOptionButton('False', '错误', q);
        } else if (q.type === '填空') {
            // 填空题：有选项则显示选项，无选项则显示输入框
            if (Array.isArray(q.options) && q.options.length > 0) {
                q.options.forEach((opt, i) => {
                    createOptionButton(i, `${opt}`, q);
                });
            } else {
                // 无选项，显示输入框
                createFillBlankInput(q);
            }
        } else if (Array.isArray(q.options) && q.options.length > 0) {
            q.options.forEach((opt, i) => {
                createOptionButton(i, `${opt}`, q);
            });
        } else {
            optionsArea.innerHTML = '<span style="color:#e74c3c;">本题无选项</span>';
        }

        // If already answered, show feedback immediately
        if (answerRecord[idx] !== null) {
            showFeedback(q, answerRecord[idx]);
            disableOptions();
            nextQuestionBtn.style.display = (currentQuestionIndex < questions.length - 1) ? 'inline-block' : 'none';
        }
    }

    function createOptionButton(value, text, question) {
        const button = document.createElement('button');
        button.className = 'option-btn';
        button.textContent = text;
        button.dataset.value = value;
        button.onclick = () => handleAnswer(button, question);
        optionsArea.appendChild(button);
    }

    // 为填空题创建输入框
    function createFillBlankInput(question) {
        const inputContainer = document.createElement('div');
        inputContainer.className = 'fill-blank-container';
        
        const label = document.createElement('label');
        label.htmlFor = 'fillBlankInput';
        label.textContent = '请输入答案：';
        label.style.cssText = 'display:block;margin-bottom:0.8em;font-weight:600;color:#374151;';
        
        const input = document.createElement('input');
        input.type = 'text';
        input.id = 'fillBlankInput';
        input.className = 'fill-blank-input';
        input.placeholder = '输入您的答案...';
        input.style.cssText = 'width:100%;padding:0.8em;border:2px solid #e5e7eb;border-radius:0.5em;font-size:1em;box-sizing:border-box;';
        
        const submitBtn = document.createElement('button');
        submitBtn.type = 'button';
        submitBtn.className = 'option-btn fill-blank-submit';
        submitBtn.textContent = '提交答案';
        submitBtn.style.cssText = 'margin-top:1em;width:100%;';
        submitBtn.onclick = (e) => {
            e.preventDefault();
            handleFillBlankAnswer(input.value, question, submitBtn);
        };
        
        // 支持按回车键提交
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                submitBtn.click();
            }
        });
        
        inputContainer.appendChild(label);
        inputContainer.appendChild(input);
        inputContainer.appendChild(submitBtn);
        optionsArea.appendChild(inputContainer);
        
        // 页面加载后自动焦点到输入框
        setTimeout(() => input.focus(), 100);
    }

    function handleAnswer(selectedButton, question) {
        if (answered) return; // Prevent multiple answers
        answered = true;
        disableOptions();

        let isCorrect = false;
        let selectedValue = selectedButton.dataset.value;

        if (question.type === '判断') {
            isCorrect = selectedValue.toLowerCase() === String(question.answer).toLowerCase();
        } else if (question.type === '多选') {
            // For multiple choice, need to handle checkboxes first, then submit
            // This UI design implies single click submission, so we'll simplify for now
            // If multiple selection is needed, optionsArea would contain checkboxes and a separate submit button
            const selectedOptions = Array.from(optionsArea.querySelectorAll('.option-btn.selected')).map(btn => parseInt(btn.dataset.value));
            if (!selectedOptions.includes(parseInt(selectedValue))) {
                selectedOptions.push(parseInt(selectedValue));
            }
            const ansArr = String(question.answer).split('').map(ch => ch.charCodeAt(0) - 65);
            isCorrect = ansArr.length === selectedOptions.length && ansArr.every(idx => selectedOptions.includes(idx));
        } else if (question.type === '填空') {
            // 填空题：比对答案（支持多个正确答案用|分割）
            const userAnswer = String(selectedValue).trim();
            const correctAnswers = String(question.answer).split('|').map(a => a.trim());
            isCorrect = correctAnswers.some(ans => userAnswer.toLowerCase() === ans.toLowerCase());
        } else { // Single choice
            isCorrect = parseInt(selectedValue) === (String(question.answer).charCodeAt(0) - 65);
        }

        answerRecord[currentQuestionIndex] = isCorrect;
        showFeedback(question, isCorrect, selectedButton);
        updateNavigatorSidebar();

        // Delay before showing next question button
        setTimeout(() => {
            nextQuestionBtn.style.display = (currentQuestionIndex < questions.length - 1) ? 'inline-block' : 'none';
        }, 1500); // 1.5 seconds delay
    }

    // 处理填空题答案
    function handleFillBlankAnswer(userAnswer, question, submitBtn) {
        if (answered) return; // Prevent multiple answers
        if (!userAnswer || !userAnswer.trim()) {
            alert('请输入答案');
            return;
        }

        answered = true;
        
        // 禁用输入框和提交按钮
        const input = document.getElementById('fillBlankInput');
        input.disabled = true;
        submitBtn.disabled = true;
        
        // 比对答案（支持多个正确答案用|分割）
        const trimmedAnswer = userAnswer.trim();
        const correctAnswers = String(question.answer).split('|').map(a => a.trim());
        const isCorrect = correctAnswers.some(ans => trimmedAnswer.toLowerCase() === ans.toLowerCase());
        
        answerRecord[currentQuestionIndex] = isCorrect;
        
        // 显示反馈
        if (isCorrect) {
            feedbackArea.innerHTML = '<span class="correct-feedback">回答正确！</span>';
            input.style.borderColor = '#10b981'; // 绿色边框
            submitBtn.classList.add('correct-answer');
        } else {
            const ansText = correctAnswers.join(' 或 ');
            feedbackArea.innerHTML = `<span class="incorrect-feedback">回答错误！<br>正确答案：${ansText}</span>`;
            input.style.borderColor = '#ef4444'; // 红色边框
            submitBtn.classList.add('incorrect-answer');
        }
        
        updateNavigatorSidebar();
        
        // Delay before showing next question button
        setTimeout(() => {
            nextQuestionBtn.style.display = (currentQuestionIndex < questions.length - 1) ? 'inline-block' : 'none';
        }, 1500); // 1.5 seconds delay
    }

    function showFeedback(question, isCorrect, selectedButton = null) {
        optionsArea.querySelectorAll('.option-btn').forEach(btn => {
            btn.classList.remove('selected'); // Remove any selected state
            btn.disabled = true; // Disable all options
        });

        if (isCorrect) {
            feedbackArea.innerHTML = '<span class="correct-feedback">回答正确！</span>';
            if (selectedButton) {
                selectedButton.classList.add('correct-answer');
                selectedButton.innerHTML += ' <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
            }
        } else {
            let ansText = '';
            if (question.type === '填空') {
                // 填空题：显示所有可接受的答案
                if (typeof question.answer === 'string') {
                    ansText = question.answer.split('|').map(a => a.trim()).join(' 或 ');
                }
            } else if (typeof question.answer === 'string') {
                ansText = question.answer;
            } else if (Array.isArray(question.answer)) {
                ansText = question.answer.map(a => typeof a === 'number' ? String.fromCharCode(65 + a) : a).join(', ');
            }
            feedbackArea.innerHTML = `<span class="incorrect-feedback">回答错误！<br>正确答案：${ansText || '无'}</span>`;

            if (selectedButton) {
                selectedButton.classList.add('incorrect-answer');
                selectedButton.innerHTML += ' <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
            }

            // Highlight correct answer for multiple choice questions
            if (question.type === '判断') {
                const correctBtn = optionsArea.querySelector(`[data-value="${String(question.answer)}"]`);
                if (correctBtn) {
                    correctBtn.classList.add('correct-answer');
                    correctBtn.innerHTML += ' <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                }
            } else if (question.type === '多选') {
                const ansArr = String(question.answer).split('').map(ch => ch.charCodeAt(0) - 65);
                ansArr.forEach(correctIdx => {
                    const correctBtn = optionsArea.querySelector(`[data-value="${correctIdx}"]`);
                    if (correctBtn) {
                        correctBtn.classList.add('correct-answer');
                        correctBtn.innerHTML += ' <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                    }
                });
            } else if (question.type === '填空') {
                // 填空题有选项时，高亮正确选项
                // (但 handleFillBlankAnswer 已经在显示时处理了)
            } else { // Single choice
                const correctIdx = String(question.answer).charCodeAt(0) - 65;
                const correctBtn = optionsArea.querySelector(`[data-value="${correctIdx}"]`);
                if (correctBtn) {
                    correctBtn.classList.add('correct-answer');
                    correctBtn.innerHTML += ' <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                }
            }
        }
    }

    function disableOptions() {
        optionsArea.querySelectorAll('.option-btn').forEach(btn => {
            btn.disabled = true;
        });
        // 禁用填空题输入框
        const fillInput = document.getElementById('fillBlankInput');
        if (fillInput) {
            fillInput.disabled = true;
        }
    }

    function updateFavoriteBtn(q) {
        let favList = getLocalFavorites();
        if (isFavorite(q, favList)) {
            favoriteBtn.classList.add('bookmarked');
        } else {
            favoriteBtn.classList.remove('bookmarked');
        }
    }

    favoriteBtn.onclick = async function() {
        const q = questions[currentQuestionIndex];
        let favList = getLocalFavorites();
        if (isFavorite(q, favList)) {
            await removeFavorite(q);
        } else {
            await addFavorite(q);
        }
        updateFavoriteBtn(q);
        updateNavigatorSidebar(); // Update bookmark status in sidebar
    };

    nextQuestionBtn.onclick = function() {
        if (currentQuestionIndex < questions.length - 1) {
            renderQuestion(currentQuestionIndex + 1);
        }
    };

    function updateNavigatorSidebar() {
        navigatorGrid.innerHTML = '';
        let favList = getLocalFavorites();

        questions.forEach((q, i) => {
            const item = document.createElement('div');
            item.className = 'navigator-item';
            item.textContent = i + 1;
            item.dataset.index = i;

            if (i === currentQuestionIndex) {
                item.classList.add('current');
            } else if (answerRecord[i] === true) {
                item.classList.add('correct');
            } else if (answerRecord[i] === false) {
                item.classList.add('incorrect');
            }

            if (isFavorite(q, favList)) {
                item.classList.add('bookmarked');
            }

            item.onclick = () => renderQuestion(i);
            navigatorGrid.appendChild(item);
        });
    }

    // Keyboard shortcuts
    document.onkeydown = function(e) {
        if (!questions.length) return;
        
        // 如果焦点在输入框、textarea或contentEditable元素内，不触发快捷键
        const activeElement = document.activeElement;
        if (activeElement && (
            activeElement.tagName === 'INPUT' || 
            activeElement.tagName === 'TEXTAREA' || 
            activeElement.contentEditable === 'true'
        )) {
            return;
        }
        
        const q = questions[currentQuestionIndex];
        const key = e.key.toUpperCase();

        if (key === 'ENTER' || key === ' ') {
            e.preventDefault();
            if (answered && nextQuestionBtn.style.display !== 'none') {
                nextQuestionBtn.click();
            } else if (!answered) {
                // Attempt to submit answer if not already answered
                // For true/false, click the selected one
                // For multiple choice, if one is selected, click it
                const selectedOption = optionsArea.querySelector('.option-btn.selected');
                if (selectedOption) {
                    selectedOption.click();
                } else if (q.type === '判断') {
                    // If true/false and nothing selected, do nothing or prompt
                } else if (q.type === '多选') {
                    // If multiple choice, and no explicit submit button, assume current selection is final
                    // This part might need refinement if multi-select with a separate submit is desired
                }
            }
        } else if (key === 'R') { // R key for favorite
            e.preventDefault();
            favoriteBtn.click();
        } else if (key === 'Q') { // Q key for previous question
            e.preventDefault();
            if (currentQuestionIndex > 0) {
                renderQuestion(currentQuestionIndex - 1);
            }
        } else if (key === 'E') { // E key for next question
            e.preventDefault();
            if (currentQuestionIndex < questions.length - 1) {
                renderQuestion(currentQuestionIndex + 1);
            }
        } else if (!answered) { // Only allow option selection if not answered
            if (q.type === '判断') {
                if (key === 'A') {
                    optionsArea.querySelector('[data-value="True"]').click();
                    e.preventDefault();
                } else if (key === 'D') {
                    optionsArea.querySelector('[data-value="False"]').click();
                    e.preventDefault();
                }
            } else { // Single and Multiple choice
                const keyMap = { 'W': 0, 'A': 1, 'S': 2, 'D': 3 };
                if (key in keyMap) {
                    const optionIndex = keyMap[key];
                    const optionButton = optionsArea.querySelector(`[data-value="${optionIndex}"]`);
                    if (optionButton) {
                        // For single choice, deselect others
                        if (q.type !== '多选') {
                            optionsArea.querySelectorAll('.option-btn').forEach(btn => btn.classList.remove('selected'));
                        }
                        optionButton.classList.toggle('selected');
                        e.preventDefault();
                    }
                }
            }
        }
    };

    // Initial load logic
    const storedQuestions = sessionStorage.getItem('quiz_questions');
    const storedTitle = sessionStorage.getItem('quiz_title');

    if (storedQuestions && storedTitle) {
        try {
            questions = JSON.parse(storedQuestions);
            quizTitleHeader.textContent = storedTitle;
            shuffleArray(questions);
            answerRecord = Array(questions.length).fill(null);
            renderQuestion(currentQuestionIndex);
            updateNavigatorSidebar();
        } catch (e) {
            console.error('Error parsing stored questions:', e);
            questionContentDiv.innerHTML = '<div style="text-align:center;margin-top:60px;font-size:18px;color:#e74c3c;">加载题库失败，请返回历史题库重新选择。<br><a href="parsed_list.html" style="color:#409eff;">返回历史题库</a></div>';
        }
    } else {
        questionContentDiv.innerHTML = '<div style="text-align:center;margin-top:60px;font-size:18px;color:#e74c3c;">未选择题库，请从历史题库页面选择一个题库。<br><a href="parsed_list.html" style="color:#409eff;">去历史题库</a></div>';
    }
});