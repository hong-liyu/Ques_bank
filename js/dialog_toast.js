/**
 * dialog_toast.js - 全局 Toast 与 Dialog 组件
 * 提供基于 Promise 的无阻塞反馈，不产生类似原生的暂停主线程的效果。
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. 初始化 Toast 容器
    let toastContainer = document.getElementById('global-toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'global-toast-container';
        document.body.appendChild(toastContainer);
    }

    // 将 showToast 挂载到全局
    window.showToast = function(message, type = 'info', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = `toast-message ${type}`;

        // 选择对应类型的图标
        let iconHtml = '';
        switch (type) {
            case 'success': iconHtml = '✓'; break;
            case 'error': iconHtml = '✕'; break;
            case 'warning': iconHtml = '⚠'; break;
            default: iconHtml = 'ℹ'; break;
        }

        toast.innerHTML = `
            <div class="toast-icon">${iconHtml}</div>
            <div class="toast-content">${message}</div>
        `;

        toastContainer.appendChild(toast);

        // 强迫重绘以生效 transition
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        // 定时移除
        setTimeout(() => {
            toast.classList.remove('show');
            toast.classList.add('hiding');
            toast.addEventListener('transitionend', () => {
                toast.remove();
            });
        }, duration);
    };

    // 2. 初始化全局 Dialog 结构
    const dialogHTML = `
        <div class="global-dialog-overlay" id="globalDialogOverlay">
            <div class="global-dialog-box" id="globalDialogBox">
                <div class="dialog-header" id="globalDialogTitle">提示</div>
                <div class="dialog-body" id="globalDialogBody">内容</div>
                <div class="dialog-footer">
                    <button class="dialog-btn dialog-btn-cancel" id="globalDialogCancel">取消</button>
                    <button class="dialog-btn dialog-btn-confirm" id="globalDialogConfirm">确定</button>
                </div>
            </div>
        </div>
    `;
    const dialogWrapper = document.createElement('div');
    dialogWrapper.innerHTML = dialogHTML;
    document.body.appendChild(dialogWrapper);

    const dialogOverlay = document.getElementById('globalDialogOverlay');
    const dialogTitle = document.getElementById('globalDialogTitle');
    const dialogBody = document.getElementById('globalDialogBody');
    const dialogCancel = document.getElementById('globalDialogCancel');
    const dialogConfirm = document.getElementById('globalDialogConfirm');

    // 通用模态框函数
    window.showConfirmDialog = function(options) {
        return new Promise((resolve) => {
            const { title = '提示', message, confirmText = '确定', cancelText = '取消', type = 'info' } = options;
            
            dialogTitle.textContent = title;
            dialogBody.innerHTML = message;
            dialogConfirm.textContent = confirmText;
            dialogCancel.textContent = cancelText;

            // 调整确认按钮的颜色
            if (type === 'danger') {
                dialogConfirm.className = 'dialog-btn dialog-btn-danger';
            } else {
                dialogConfirm.className = 'dialog-btn dialog-btn-confirm';
            }

            dialogOverlay.classList.add('active');

            const cleanup = () => {
                dialogOverlay.classList.remove('active');
                dialogConfirm.removeEventListener('click', onConfirm);
                dialogCancel.removeEventListener('click', onCancel);
            };

            const onConfirm = () => { cleanup(); resolve(true); };
            const onCancel = () => { cleanup(); resolve(false); };

            dialogConfirm.addEventListener('click', onConfirm);
            dialogCancel.addEventListener('click', onCancel);
        });
    };

    // 基于 Promise 的 prompt
    window.showPromptDialog = function(options) {
        return new Promise((resolve) => {
            const { title = '请输入', defaultValue = '', placeholder = '', confirmText = '确定', cancelText = '取消' } = options;
            
            dialogTitle.textContent = title;
            dialogBody.innerHTML = `
                <input type="text" class="dialog-input" id="globalDialogInput" placeholder="${placeholder}" value="${defaultValue}">
            `;
            
            dialogConfirm.textContent = confirmText;
            dialogCancel.textContent = cancelText;
            dialogConfirm.className = 'dialog-btn dialog-btn-confirm';
            
            dialogOverlay.classList.add('active');
            
            const inputEl = document.getElementById('globalDialogInput');
            inputEl.focus();
            inputEl.select();

            const cleanup = () => {
                dialogOverlay.classList.remove('active');
                dialogConfirm.removeEventListener('click', onConfirm);
                dialogCancel.removeEventListener('click', onCancel);
                inputEl.removeEventListener('keydown', onKeyDown);
            };

            const onConfirm = () => { 
                const val = inputEl.value;
                cleanup(); 
                resolve(val); 
            };
            const onCancel = () => { cleanup(); resolve(null); };
            const onKeyDown = (e) => {
                if (e.key === 'Enter') onConfirm();
                if (e.key === 'Escape') onCancel();
            }

            dialogConfirm.addEventListener('click', onConfirm);
            dialogCancel.addEventListener('click', onCancel);
            inputEl.addEventListener('keydown', onKeyDown);
        });
    };
});