document.addEventListener('DOMContentLoaded', () => {
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');
    const fileNameDisplay = document.getElementById('file-name');
    const uploadLink = document.querySelector('.upload-link');

    // Trigger file input click when the link or area is clicked
    uploadLink.addEventListener('click', (e) => {
        e.preventDefault();
        fileInput.click();
    });
    uploadArea.addEventListener('click', () => {
        fileInput.click();
    });

    // Handle file selection
    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            handleFile(fileInput.files[0]);
        }
    });

    // Drag and drop functionality
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            fileInput.files = e.dataTransfer.files;
            handleFile(e.dataTransfer.files[0]);
        }
    });

    function handleFile(file) {
        fileNameDisplay.textContent = `已选择文件：${file.name}`;
        // You can add more logic here, like file validation or preview
    }

    // Example of showing results (for demonstration)
    const parseButton = document.getElementById('parse-button');
    const resultsContainer = document.getElementById('results-container');
    const resultsOutput = document.getElementById('results-output');

    parseButton.addEventListener('click', () => {
        // Dummy result for now
        const dummyResult = {
            "question": "中国的首都是哪里？",
            "options": ["A. 上海", "B. 北京", "C. 广州", "D. 深圳"],
            "answer": "B"
        };

        resultsContainer.style.display = 'block';
        resultsOutput.textContent = JSON.stringify(dummyResult, null, 2);
    });
});
