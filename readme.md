# 题库刷题系统

一个面向本地使用的题库练习工具，后端基于 Flask，前端使用原生 HTML/CSS/JavaScript。项目支持上传题库文件、调用 DeepSeek 将内容解析成结构化题目，并提供刷题、考试、收藏、历史题库管理和题库拆分等功能。

## 功能概览

- 上传 `.docx`、`.pdf`、`.txt` 文件并解析为题库。
- 支持自定义题库名称和 AI 解析提示词。
- 历史题库管理：搜索、排序、预览、重命名、删除、拆分。
- 刷题模式：即时提交、查看答案、统计本轮正确情况。
- 考试模式：先保存答案，最后统一交卷和查看结果。
- 收藏夹：创建多个收藏夹，将题目按主题或复习计划归类。
- 练习统计：记录题库完成次数、答题总数、正确数和最后完成时间。
- 本地桌面窗口：可通过 `pywebview` 以桌面应用形式打开。

## 技术栈

- Python 3
- Flask
- Flask-CORS
- python-docx
- PyPDF2
- python-dotenv
- requests
- pywebview
- 原生 HTML / CSS / JavaScript

## 目录结构

```text
.
├── api/                         # Flask 接口与题库解析逻辑
│   ├── app.py                   # 后端入口、API 路由、静态资源服务
│   └── ai_parse_question.py     # 文件文本提取与 DeepSeek 解析
├── HTML/                        # 前端页面
│   ├── index.html               # 首页
│   ├── upload.html              # 上传与解析页面
│   ├── quiz.html                # 刷题页面
│   ├── parsed_list.html         # 历史题库页面
│   └── favorites.html           # 收藏夹页面
├── css/                         # 页面样式
├── js/                          # 前端交互脚本
├── assets/                      # 图标等静态资源
├── data/                        # 本地运行数据，默认不提交到 Git
├── main.py                      # 桌面模式入口
├── requirements.txt             # Python 依赖
├── .env.example                 # 环境变量示例
└── Install-SuperStartShortcuts.ps1
```

## 快速开始

### 1. 创建虚拟环境

PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

或者使用 Conda:

```powershell
conda create -n ques_bank python=3.11
conda activate ques_bank
```

### 2. 安装依赖

```powershell
pip install -r requirements.txt
```

### 3. 配置环境变量

复制 `.env.example` 为 `.env`：

```powershell
Copy-Item .env.example .env
```

然后在 `.env` 中填写 DeepSeek 配置：

```env
DEEPSEEK_API_KEY=your_deepseek_api_key_here
DEEPSEEK_API_BASE=https://api.deepseek.com/v1
```

`DEEPSEEK_API_BASE` 可以保持默认值。没有有效的 `DEEPSEEK_API_KEY` 时，AI 解析功能无法正常使用。

## 启动方式

### Web 模式

```powershell
python api/app.py
```

启动后访问：

```text
http://127.0.0.1:5000/
```

Flask 服务默认监听 `0.0.0.0:5000`。如果端口已被占用，需要先关闭占用该端口的程序，或修改 `api/app.py` 中的端口配置。

### 桌面模式

```powershell
python main.py
```

桌面模式会先启动 Flask 后端，再使用 `pywebview` 打开本地窗口。

### Windows 快捷方式

如果当前项目目录中存在 `SuperStart.vbs`，可以用下面的脚本创建桌面快捷方式和开机启动快捷方式：

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

## 使用流程

1. 打开首页，进入「上传题库」。
2. 选择 `.docx`、`.pdf` 或 `.txt` 文件。
3. 可选：填写题库名称，或补充自定义解析提示词。
4. 点击开始解析，等待进度完成。
5. 解析成功后进入「去刷题」，或在「历史题库」中选择题库。
6. 选择练习模式或考试模式开始答题。
7. 遇到需要复习的题目，可以加入收藏夹。

## 题目数据格式

解析后的题库会保存为 JSON 文件，通常位于：

```text
data/parsed/
```

单个题目的常见结构如下：

```json
{
  "type": "单选题",
  "content": "题干内容",
  "options": ["A. 选项一", "B. 选项二", "C. 选项三", "D. 选项四"],
  "answer": "A"
}
```

多答案题目可以使用 `|` 分隔答案，例如：

```json
{
  "type": "填空题",
  "content": "请填写两个关键词。",
  "options": [],
  "answer": "关键词一|关键词二"
}
```

## 本地数据说明

运行过程中会生成以下本地数据：

```text
data/parsed_questions.json       # 历史题库索引
data/parsed/*.json               # 每次解析得到的题库文件
data/parsed/favorites.json       # 收藏夹与收藏题目
```

这些文件通常包含个人题库、练习记录或收藏内容，默认不建议提交到 Git。

## 常用 API

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/history_questions` | GET | 获取历史题库列表 |
| `/api/ai_upload_question` | POST | 上传文件并启动 AI 解析任务 |
| `/api/ai_upload_progress` | GET | 查询解析进度 |
| `/api/abort_task` | GET | 中止当前解析任务 |
| `/api/delete_history` | POST | 删除历史题库 |
| `/api/rename_question` | POST | 重命名题库 |
| `/api/quiz_session_complete` | POST | 保存本轮刷题统计 |
| `/api/favorite_folders` | GET / POST | 获取或创建收藏夹 |
| `/api/favorite_questions` | GET / POST / DELETE | 获取、添加或删除收藏题目 |
| `/api/split_question_bank` | POST | 拆分题库 |

## 发布前检查

- 不要提交 `.env` 或真实 API Key。
- 不要提交 `data/`、`api/data/` 中的个人题库和练习记录。
- 不要提交 `node_modules/`、`__pycache__/`、虚拟环境等生成内容。
- 如果真实 API Key 曾进入 Git 历史，请及时轮换密钥。
- 示例题库发布前应检查版权、个人信息和内部资料风险。

## 故障排查

### AI 解析失败

优先检查：

- `.env` 是否存在。
- `DEEPSEEK_API_KEY` 是否有效。
- 网络是否可以访问 `DEEPSEEK_API_BASE`。
- 上传文件是否为 `.docx`、`.pdf` 或 `.txt`。

### 页面能打开但没有题库

先进入「上传题库」完成一次解析。历史题库索引保存在 `data/parsed_questions.json`，删除 `data/` 后历史记录也会消失。

### 桌面模式打不开

先确认依赖已安装：

```powershell
pip install -r requirements.txt
```

如果桌面窗口仍无法打开，可以改用 Web 模式：

```powershell
python api/app.py
```

然后访问 `http://127.0.0.1:5000/`。

## 维护建议

- 为核心 API 增加自动化测试。
- 为示例题库准备匿名化演示数据。
- 将题目 JSON 格式整理成更严格的 schema。
- 根据真实使用场景补充部署说明和更新日志。
