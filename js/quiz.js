// ===== 新版：题库选择下拉框和题库加载，完全依赖后端 =====
(async function renderQuizSelectorAndLoadQuestions() {
    console.log('renderQuizSelectorAndLoadQuestions started.'); // Log 1
    const selector = document.getElementById('quizSelector');
    const main = document.getElementById('quizMain');
    let history = [];
    let questions = []; // Main questions array
    let quizTitle = '题库';
    let currentFile = '';

    // 加载收藏工具
    if (typeof getLocalFavorites === 'undefined') {
        const script = document.createElement('script');
        script.src = 'js/favorite.js';
        document.head.appendChild(script);
    }

    // 1. 获取题库历史
    try {
        const res = await fetch('/api/history_questions');
        const data = await res.json();
        if (data.success && Array.isArray(data.history)) {
            history = data.history;
            console.log('History questions loaded:', history); // Log 2
        }
    } catch (e) {
        console.error('Error fetching history questions:', e);
        history = [];
    }

    // 2. 渲染下拉框
    if (selector) {
        selector.innerHTML = '';
        if (!history.length) {
            selector.innerHTML = '<option value="">暂无题库</option>';
            selector.disabled = true;
        } else {
            selector.disabled = false;
            history.forEach((item, idx) => {
                const opt = document.createElement('option');
                opt.value = item.file;
                opt.textContent = item.origin_name || item.title || '题库'+(idx+1);
                selector.appendChild(opt);
            });
            // 默认选中第一个
            currentFile = history[0].file;
            quizTitle = history[0].origin_name || history[0].title || '题库';
            selector.value = currentFile;
            console.log('Initial selected file:', currentFile); // Log 3
        }

        // 切换题库事件
        selector.onchange = async function() {
            console.log('quizSelector onchange triggered. New value:', this.value); // Log 4
            currentFile = this.value;
            const item = history.find(h => h.file === currentFile);
            quizTitle = item ? (item.origin_name || item.title || '题库') : '题库';
            await loadQuestionsAndRender(currentFile, quizTitle);
        };
    }

    // 3. 加载题库内容并渲染
    if (currentFile) {
        await loadQuestionsAndRender(currentFile, quizTitle);
    } else if (main) {
        main.innerHTML = '<div style="text-align:center;margin-top:60px;font-size:18px;color:#e74c3c;">请先上传并解析题库后再刷题。<br><a href="upload.html" style="color:#409eff;">去上传题库</a></div>';
    }

    async function loadQuestionsAndRender(file, quizTitle) {
        console.log('loadQuestionsAndRender started. File:', file, 'Title:', quizTitle); // Log 5
        // 切换题库前移除旧的答题记录面板
        const oldPanel = document.getElementById('answerRecordPanel');
        if (oldPanel) oldPanel.remove();

        if (!file) {
            console.log('File is empty, returning from loadQuestionsAndRender.'); // Log 6
            return;
        }
        // questions is the global one
        try {
            const res = await fetch(`/data/parsed/${file}`);
            const fetchedQuestions = await res.json();
            questions.length = 0; // Clear existing questions
            questions.push(...fetchedQuestions); // Populate global questions array
            console.log('Questions fetched and updated global array. Total questions:', questions.length); // Log 7
            // 洗牌函数，打乱题目顺序
            function shuffleArray(arr) {
                for (let i = arr.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [arr[i], arr[j]] = [arr[j], arr[i]];
                }
            }
            shuffleArray(questions);
        } catch (e) {
            console.error('Error fetching questions from file:', file, e); // Log 8
            questions.length = 0; // Clear questions on error
        }

        if (!Array.isArray(questions) || !questions.length) {
            console.log('Questions array is empty or not an array. Displaying error message.'); // Log 9
            main.innerHTML = '<div style="text-align:center;margin-top:60px;font-size:18px;color:#e74c3c;">题库内容为空或加载失败。</div>';
            return;
        }
        // 清空主区域
        main.innerHTML = '';
        // 题库预览按钮和弹窗
        const previewBtn = document.createElement('button');
        previewBtn.textContent = quizTitle;
        previewBtn.className = 'preview-btn-top';
        previewBtn.style.position = 'fixed';
        previewBtn.style.top = '32px';
        previewBtn.style.right = '36px';
        previewBtn.style.zIndex = '10000';
        main.appendChild(previewBtn);
        const previewModal = document.createElement('div');
        previewModal.style.cssText = 'display:none;position:fixed;z-index:9999;left:0;top:0;width:100vw;height:100vh;background:rgba(0,0,0,0.25);align-items:center;justify-content:center;';
        previewModal.innerHTML = `
            <div style="background:#fff;max-width:90vw;max-height:80vh;overflow:auto;border-radius:10px;padding:28px 22px 18px 22px;box-shadow:0 8px 32px rgba(64,158,255,0.18);position:relative;">
                <button id="closePreviewBtn" style="position:absolute;top:10px;right:16px;font-size:18px;background:none;border:none;cursor:pointer;color:#888;">×</button>
                <h2 style="margin-top:0;font-size:20px;text-align:center;">题库预览</h2>
                <div id="previewContent" style="font-size:15px;line-height:1.7;"></div>
            </div>
        `;
        document.body.appendChild(previewModal);
        previewBtn.onclick = function() {
            const contentDiv = previewModal.querySelector('#previewContent');
            contentDiv.innerHTML = questions.map((q, i) => {
                let opts = '';
                if (Array.isArray(q.options)) {
                    opts = q.options.map((opt, idx) => `<div style="margin-left:18px;">${opt}</div>`).join('');
                }
                let ans = '';
                if (Array.isArray(q.answer)) {
                    ans = q.answer.join(', ');
                } else if (typeof q.answer === 'string') {
                    ans = q.answer;
                }
                return `<div style="margin-bottom:18px;">
                    <b>题目${i+1}（${q.type || '未知类型'}）</b>：${q.content || q.text || ''}<br>
                    ${opts ? '选项：<br>' + opts : ''}
                    <span style="color:#888;">答案：${ans || '无'}</span>
                </div>`;
            }).join('');
            previewModal.style.display = 'flex';
        };
        previewModal.querySelector('#closePreviewBtn').onclick = function() {
            previewModal.style.display = 'none';
        };
        // 创建刷题主区域
        const quizContainer = document.createElement('div');
        quizContainer.className = 'quiz-container';
        quizContainer.innerHTML = `
            <div id="progress"></div>
            <div id="question"></div>
            <form id="optionsForm"></form>
            <div class="btn-row">
                <button id="submitBtn">提交答案</button>
                <button id="nextBtn" style="display:none;">下一题</button>
            </div>
            <div id="result"></div>
        `;
        main.appendChild(quizContainer);
        let current = 0;
        let answered = false;
        let answerRecord = Array(questions.length).fill(null);
        function updateProgress() {
            document.getElementById('progress').textContent = `第 ${current + 1} / ${questions.length} 题`;
        }
        function loadQuestion(idx) {
            console.log('loadQuestion called for index:', idx); // Log 10
            answered = false;
            document.getElementById('result').textContent = '';
            document.getElementById('result').className = '';
            document.getElementById('nextBtn').style.display = 'none';
            document.getElementById('submitBtn').disabled = false;
            updateProgress();
            const q = questions[idx];
            console.log('Current question (q):', q); // Log 11
            const questionDiv = document.getElementById('question');
            // 收藏按钮逻辑
            let favBtn = document.createElement('button');
            favBtn.className = 'favorite-btn';
            favBtn.style.marginLeft = '18px';
            favBtn.style.fontSize = '15px';
            favBtn.style.padding = '2px 18px';
            favBtn.style.borderRadius = '6px';
            favBtn.style.border = '1px solid #ffe58f';
            favBtn.style.marginTop = '18px';
            favBtn.style.marginBottom = '0';
            favBtn.style.float = 'right';
            favBtn.style.background = '#fffbe6';
            favBtn.style.color = '#d48806';
            // 判断收藏状态
            function updateFavBtn() {
                let favList = getLocalFavorites();
                if (isFavorite(q, favList)) {
                    favBtn.textContent = '已收藏';
                    favBtn.style.background = '#ffe58f';
                    favBtn.style.color = '#ad6800';
                } else {
                    favBtn.textContent = '收藏';
                    favBtn.style.background = '#fffbe6';
                    favBtn.style.color = '#d48806';
                }
            }
            favBtn.onclick = async function() {
                let favList = getLocalFavorites();
                if (isFavorite(q, favList)) {
                    await removeFavorite(q);
                } else {
                    await addFavorite(q);
                }
                updateFavBtn();
            };
            questionDiv.innerHTML = `<div style="background:#f8fbff;border-radius:10px;padding:18px 18px 16px 18px;margin-bottom:18px;box-shadow:0 2px 8px rgba(64,158,255,0.08);font-size:20px;font-weight:bold;color:#222;line-height:1.8;letter-spacing:0.5px;word-break:break-all;">${q.content || q.text || ''}</div>`;
            questionDiv.appendChild(favBtn);
            updateFavBtn();
            const form = document.getElementById('optionsForm');
            form.innerHTML = '';
            form.classList.remove('true-false-options'); // Always remove first

            if (q.type === '判断') {
                form.classList.add('true-false-options'); // Add class for true/false layout
                const trueBtn = document.createElement('button');
                trueBtn.textContent = '正确';
                trueBtn.className = 'option-label';
                trueBtn.type = 'button'; // Prevent form submission
                trueBtn.onclick = () => {
                    form.dataset.selected = 'True';
                    trueBtn.classList.add('selected');
                    falseBtn.classList.remove('selected');
                };

                const falseBtn = document.createElement('button');
                falseBtn.textContent = '错误';
                falseBtn.className = 'option-label';
                falseBtn.type = 'button'; // Prevent form submission
                falseBtn.onclick = () => {
                    form.dataset.selected = 'False';
                    falseBtn.classList.add('selected');
                    trueBtn.classList.remove('selected');
                };

                form.appendChild(trueBtn);
                form.appendChild(falseBtn);
            } else if (Array.isArray(q.options)) {
                q.options.forEach((opt, i) => {
                    const label = document.createElement('label');
                    label.className = 'option-label';
                    const input = document.createElement('input');
                    input.type = (q.type === '多选') ? 'checkbox' : 'radio';
                    input.name = 'option';
                    input.value = i;
                    input.onclick = function() {
                        document.querySelectorAll('.option-label').forEach(lab => lab.classList.remove('selected'));
                        label.classList.add('selected');
                    };
                    label.appendChild(input);
                    label.appendChild(document.createTextNode(opt));
                    form.appendChild(label);
                });
            } else {
                form.innerHTML = '<span style="color:#e74c3c;">本题无选项</span>';
            }
        }
        document.getElementById('submitBtn').onclick = function(e) {
            console.log('submitBtn.onclick triggered.'); // Log 12
            e.preventDefault();
            if (answered) return;
            const q = questions[current];
            console.log('Question on submit:', q); // Log 13
            let correct = false;
            let selected = [];

            answered = true;
            document.getElementById('submitBtn').disabled = true;

            if (q.type === '判断') {
                const selectedAnswer = document.getElementById('optionsForm').dataset.selected;
                console.log('True/False question. Selected:', selectedAnswer, 'Expected:', q.answer); // Log 14
                if (!selectedAnswer) {
                    document.getElementById('result').textContent = '请选择答案！';
                    document.getElementById('result').className = '';
                    answered = false;
                    document.getElementById('submitBtn').disabled = false;
                    return;
                }
                correct = selectedAnswer.toLowerCase() === String(q.answer).toLowerCase();
            } else {
                const opts = document.getElementsByName('option');
                for (let i = 0; i < opts.length; i++) {
                    if (opts[i].checked) {
                        selected.push(i);
                    }
                }
                console.log('Multiple choice/Single choice question. Selected indices:', selected, 'Expected:', q.answer); // Log 15
                if (selected.length === 0) {
                    document.getElementById('result').textContent = '请选择答案！';
                    document.getElementById('result').className = '';
                    answered = false;
                    document.getElementById('submitBtn').disabled = false;
                    return;
                }
                if (q.type === '多选' && typeof q.answer === 'string') {
                    const ansArr = q.answer.split('').map(ch => ch.charCodeAt(0) - 65);
                    correct = ansArr.length === selected.length && ansArr.every(idx => selected.includes(idx));
                } else if (typeof q.answer === 'string') {
                    correct = selected.length === 1 && selected[0] === (q.answer.charCodeAt(0) - 65);
                } else {
                    correct = false;
                }
            }

            answerRecord[current] = correct;
            if (correct) {
                document.getElementById('result').textContent = '回答正确！';
                document.getElementById('result').className = 'correct';
            } else {
                let ansText = '';
                if (typeof q.answer === 'string') {
                    ansText = q.answer;
                } else if (Array.isArray(q.answer)) {
                    ansText = q.answer.join(', ');
                }
                document.getElementById('result').innerHTML = '回答错误！<br><span style="color:#245fd6;font-weight:normal;font-size:16px;">正确答案：' + (ansText || '无') + '</span>';
                document.getElementById('result').className = 'incorrect';
            }
            document.getElementById('nextBtn').style.display = (current < questions.length - 1) ? 'inline-block' : 'none';
            console.log('Submit process finished. Correct:', correct); // Log 16
        };
        document.getElementById('nextBtn').onclick = function(e) {
            console.log('nextBtn.onclick triggered.'); // Log 17
            e.preventDefault();
            if (current < questions.length - 1) {
                current++;
                loadQuestion(current);
            }
        };
        loadQuestion(current);
        // 答题记录面板
        const recordPanel = document.createElement('div');
        recordPanel.id = 'answerRecordPanel';
        recordPanel.style.cssText = `position:fixed;top:100px;right:36px;width:110px;background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(64,158,255,0.13);padding:18px 12px;z-index:9998;display:flex;flex-direction:column;align-items:center;gap:12px;transition:box-shadow 0.2s;`;
        recordPanel.innerHTML = `<div style='font-size:16px;font-weight:600;margin-bottom:10px;letter-spacing:1px;'>答题记录</div><div id='recordList' style='display:flex;flex-wrap:wrap;gap:10px;justify-content:center;'></div>`;
        document.body.appendChild(recordPanel);
        function renderRecordPanel() {
            const list = recordPanel.querySelector('#recordList');
            list.innerHTML = '';
            const maxPerRow = 2;
            for (let i = 0; i < questions.length; i++) {
                const btn = document.createElement('button');
                btn.textContent = i + 1;
                btn.style.cssText = `width:38px;height:32px;border-radius:8px;border:none;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;gap:3px;transition:background 0.15s,box-shadow 0.15s;outline:none;`;
                if (answerRecord[i] === true) {
                    btn.classList.add('correct');
                } else if (answerRecord[i] === false) {
                    btn.classList.add('incorrect');
                }
                if (i === current) {
                    btn.style.border = '2px solid #409eff';
                    btn.style.background = '#e6f7ff';
                }
                btn.onmouseenter = function() { btn.style.boxShadow = '0 2px 8px #91d5ff'; };
                btn.onmouseleave = function() { btn.style.boxShadow = 'none'; };
                btn.onclick = function() {
                    current = i;
                    loadQuestion(current);
                };
                list.appendChild(btn);
            }
            if (questions.length % maxPerRow === 1) {
                list.style.justifyContent = 'flex-start';
                if (list.children.length > 0) {
                    list.children[list.children.length - 1].style.marginLeft = '0';
                }
            } else {
                list.style.justifyContent = 'center';
                for (let i = 0; i < list.children.length; i++) {
                    list.children[i].style.marginLeft = '';
                }
            }
        }
        const oldLoadQuestion = loadQuestion;
        loadQuestion = function(idx) {
            oldLoadQuestion(idx);
            renderRecordPanel();
        };
        renderRecordPanel();

        // 键盘刷题功能
        document.onkeydown = function(e) {
            if (!questions.length) return;
            const q = questions[current];
            const key = e.key.toUpperCase();

            if (q.type === '判断') {
                const form = document.getElementById('optionsForm');
                const trueBtn = form.querySelector('button:nth-child(1)'); // Assuming '正确' is the first button
                const falseBtn = form.querySelector('button:nth-child(2)'); // Assuming '错误' is the second button

                if (key === 'A' && trueBtn) {
                    trueBtn.click();
                    e.preventDefault();
                } else if (key === 'D' && falseBtn) {
                    falseBtn.click();
                    e.preventDefault();
                }
            } else { // 单选和多选
                const opts = document.getElementsByName('option');
                if (!opts.length) return; // This check only applies to radio/checkbox options
                const keyMap = { 'W': 0, 'A': 1, 'S': 2, 'D': 3 };
                if (key in keyMap) {
                    const idx = keyMap[key];
                    if (idx >= opts.length) return;
                    if (q.type === '多选') {
                        opts[idx].checked = !opts[idx].checked;
                        // 视觉高亮
                        const label = opts[idx].parentElement;
                        if (opts[idx].checked) {
                            label.classList.add('selected');
                        } else {
                            label.classList.remove('selected');
                        }
                    } else { // 单选
                        for (let i = 0; i < opts.length; i++) {
                            opts[i].checked = false;
                            opts[i].parentElement.classList.remove('selected');
                        }
                        opts[idx].checked = true;
                        opts[idx].parentElement.classList.add('selected');
                    }
                    e.preventDefault();
                }
            }
            // 回车或空格提交并跳转下一题
            if (key === 'ENTER' || key === ' ') {
                const submitBtn = document.getElementById('submitBtn');
                const nextBtn = document.getElementById('nextBtn');
                if (submitBtn && !submitBtn.disabled) {
                    submitBtn.click();
                } else if (nextBtn && nextBtn.style.display !== 'none') {
                    nextBtn.click();
                }
                e.preventDefault();
            } else if (key === 'R') { // R键收藏/取消收藏
                const favBtn = document.querySelector('.favorite-btn');
                if (favBtn) {
                    favBtn.click();
                }
                e.preventDefault();
            }
        };
    }
})();