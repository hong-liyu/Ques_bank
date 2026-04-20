# 题库刷题系统

一个基于 `Flask + 原生 HTML/CSS/JS` 的本地题库练习项目，支持文档解析、历史题库管理、刷题统计、收藏夹、题库拆分和完成反馈。

## 功能概览

- 上传 `.docx` / `.pdf` / `.txt` 文件并解析为题库
- 历史题库列表、预览、重命名、删除、拆分
- 刷题统计：累计完成次数、正确率、本轮用时
- 收藏夹系统：按收藏夹管理不同类型题目
- 本地桌面模式：可通过 `pywebview` 启动窗口版

## 技术栈

- Python
- Flask
- Flask-CORS
- 原生 HTML / CSS / JavaScript
- python-docx
- PyPDF2
- pywebview

## 目录结构

```text
api/          Flask 后端与解析逻辑
HTML/         页面模板
css/          页面样式
js/           前端交互脚本
assets/       静态素材
data/         本地运行时数据（默认不提交到 Git）
main.py       桌面版入口
```

## 环境准备

### 1. 创建虚拟环境

```powershell
python -m venv .venv
.venv\Scripts\activate
```

也可以使用 Conda：

```powershell
conda create -n ques_bank python=3.11
conda activate ques_bank
```

### 2. 安装依赖

```powershell
pip install -r requirements.txt
```

如果你需要桌面窗口模式，请确认额外安装成功：

```powershell
pip install pywebview
```

## 环境变量

复制 `.env.example` 为 `.env`，再填入你自己的密钥：

```env
DEEPSEEK_API_KEY=your_real_key
DEEPSEEK_API_BASE=https://api.deepseek.com/v1
```

## 启动方式

### Web 模式

```powershell
python api/app.py
```

打开浏览器访问：

```text
http://127.0.0.1:5000/
```

### 桌面模式

```powershell
python main.py
```

### 一键启动（桌面快捷方式 + 开机自启动）

项目内置了 [SuperStart.vbs](SuperStart.vbs)，会按顺序静默启动：
- 题库服务（调用 [start_ques.ps1](start_ques.ps1)）
- frpc 内网穿透

你可以运行 [Install-SuperStartShortcuts.ps1](Install-SuperStartShortcuts.ps1) 自动创建：
- 桌面快捷方式
- 开机启动快捷方式（当前用户启动目录）

安装（默认同时创建两者）：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Install-SuperStartShortcuts.ps1
```

只创建桌面快捷方式：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Install-SuperStartShortcuts.ps1 -DesktopOnly
```

只创建开机启动快捷方式：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Install-SuperStartShortcuts.ps1 -StartupOnly
```

移除快捷方式：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Install-SuperStartShortcuts.ps1 -Remove
```

## 发布到 GitHub 前的安全建议

- 不要提交 `.env`
- 不要提交 `data/` 下的个人题库、收藏和历史记录
- 不要提交 `node_modules/`、`__pycache__/` 等生成文件
- 如果真实 API key 曾经进入 git 历史，请先轮换 key
- 检查样例题库是否包含版权内容、个人信息或学校内部资料

## 推荐发布内容

- 源代码
- `.env.example`
- `requirements.txt`
- `package.json`
- 项目截图
- 一份清晰的 README

## 后续可补充

- 部署说明
- 示例题库的匿名演示数据
- 自动化测试
- 更新日志
