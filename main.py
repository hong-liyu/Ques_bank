import os
import subprocess
import sys
import threading
import time

try:
    import webview
except ImportError as exc:
    raise SystemExit(
        "pywebview 未安装，请先执行 `pip install -r requirements.txt` 后再运行 main.py"
    ) from exc
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def start_backend():
    # 启动后端服务
    subprocess.Popen([sys.executable, os.path.join(BASE_DIR, 'api', 'app.py')], cwd=BASE_DIR)

if __name__ == '__main__':
    # 启动后端
    threading.Thread(target=start_backend, daemon=True).start()
    # 等待后端启动
    time.sleep(2)
    # 打开前端页面，设置为2560x1600屏幕的半屏（1280x1200）
    webview.create_window('题库系统', 'http://127.0.0.1:5000', width=1280, height=1200)
    webview.start()
