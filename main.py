import webview
import subprocess
import threading
import time
import os

def start_backend():
    # 启动后端服务
    subprocess.Popen(['python', 'api/app.py'])

if __name__ == '__main__':
    # 启动后端
    threading.Thread(target=start_backend, daemon=True).start()
    # 等待后端启动
    time.sleep(2)
    # 打开前端页面，设置为2560x1600屏幕的半屏（1280x1200）
    webview.create_window('题库系统', 'http://127.0.0.1:5000', width=1280, height=1200)
    webview.start()