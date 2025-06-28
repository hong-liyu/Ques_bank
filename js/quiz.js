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
        questionContentDiv.innerHTML = `<span>${idx + 1}. ${q.content || q.text || ''}</span>`;

        // Update favorite button state
        updateFavoriteBtn(q);

        // Render options
        if (q.type === '判断') {
            createOptionButton('True', '正确', q);
            createOptionButton('False', '错误', q);
        } else if (Array.isArray(q.options)) {
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
            if (typeof question.answer === 'string') {
                ansText = question.answer;
            } else if (Array.isArray(question.answer)) {
                ansText = question.answer.map(a => typeof a === 'number' ? String.fromCharCode(65 + a) : a).join(', ');
            }
            feedbackArea.innerHTML = `<span class="incorrect-feedback">回答错误！<br>正确答案：${ansText || '无'}</span>`;

            if (selectedButton) {
                selectedButton.classList.add('incorrect-answer');
                selectedButton.innerHTML += ' <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
            }

            // Highlight correct answer
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