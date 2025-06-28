from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import threading
import uuid
import re
import logging
import time
from docx import Document
from ai_parse_question import parse_file_with_ai
import json
import os

from dotenv import load_dotenv
load_dotenv()

DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY")
DEEPSEEK_API_BASE = os.environ.get("DEEPSEEK_API_BASE", "https://api.deepseek.com/v1")
# 简化日志配置
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

# 设置 Flask 静态文件目录为上级目录的 HTML 文件夹
app = Flask(__name__, static_folder='../HTML', static_url_path='/')
CORS(app)
progress_dict = {}
abort_flags = {}  # 新增：任务中断标志

# 历史题库持久化相关配置
DATA_DIR = './data'
HISTORY_FILE = os.path.join(DATA_DIR, 'parsed_questions.json')
PARSED_DIR = os.path.join(DATA_DIR, 'parsed')

# 工具函数：加载历史题库
def load_history():
    if not os.path.exists(HISTORY_FILE):
        return []
    try:
        with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"读取历史题库失败: {e}")
        return []

# 工具函数：保存历史题库
def save_history(history):
    os.makedirs(DATA_DIR, exist_ok=True)
    try:
        with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
            json.dump(history, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error(f"保存历史题库失败: {e}")

# 工具函数：保存单次解析结果到独立文件
def save_parsed_questions(questions):
    os.makedirs(PARSED_DIR, exist_ok=True)
    file_id = str(uuid.uuid4())
    file_name = f'parsed_{file_id}.json'
    file_path = os.path.join(PARSED_DIR, file_name)
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(questions, f, ensure_ascii=False, indent=2)
    return file_name

# ========== 新增：历史题库接口 ==========
@app.route('/api/history_questions')
def history_questions():
    """
    获取所有历史题库
    """
    return jsonify(success=True, history=load_history())

@app.route('/api/upload_question', methods=['POST'])
def upload_question():
    file = request.files.get('file')
    if not file or not file.filename.endswith('.docx'):
        return jsonify(success=False, error='仅支持 docx 文件')
    try:
        logger.info("收到文件，开始解析 docx ...")
        doc = Document(file)
        lines = [p.text.strip() for p in doc in doc.paragraphs if p.text.strip()]
        questions = []
        q_pattern = r'^\s*(\d+)[\.\)、)]\s*'
        current, current_num = "", None
        for line in lines:
            m = re.match(q_pattern, line)
            if m:
                if current:
                    questions.append({'num': current_num, 'text': current.strip()})
                current_num = int(m.group(1))
                current = line
            else:
                current += "\n" + line if current else line
        if current:
            questions.append({'num': current_num, 'text': current.strip()})
        result = [{'id': i+1, 'content': q['text']} for i, q in enumerate(questions)]
        # 保存到单独文件
        file_name = save_parsed_questions(result)
        # 保存索引到历史题库，增加origin_name
        history = load_history()
        history.append({'type': 'local', 'file': file_name, 'origin_name': file.filename, 'time': time.strftime('%Y-%m-%d %H:%M:%S')})
        save_history(history)
        return jsonify(success=True, questions=result)
    except Exception as e:
        logger.error(f"本地解析异常：{e}")
        return jsonify(success=False, error="本地解析异常: " + str(e))

@app.route('/api/ai_upload_question', methods=['POST'])
def ai_upload_question():
    file = request.files.get('file') or request.files.get('questionFile')
    if not file:
        return jsonify(success=False, error='未接收到文件')
    
    filename = file.filename
    file_extension = os.path.splitext(filename)[1].lower()
    
    supported_extensions = ['.docx', '.pdf', '.txt']
    if file_extension not in supported_extensions:
        return jsonify(success=False, error=f'不支持的文件类型: {file_extension}，目前仅支持 {", ".join(supported_extensions)}')

    custom_prompt = request.form.get('custom_prompt', '').strip()
    model = request.form.get('model', 'deepseek-chat')
    file_bytes = file.read()
    task_id = str(uuid.uuid4())
    progress_dict[task_id] = {'status': 'pending'}
    abort_flags[task_id] = threading.Event()  # 新增：为任务创建中断标志
    logger.info(f"创建AI解析任务：{task_id}，模型：{model}，文件类型：{file_extension}")

    def run_parse():
        import io
        try:
            # 新增：传递abort_flag给AI解析
            questions = parse_file_with_ai(io.BytesIO(file_bytes), file_extension, model=model, custom_prompt=custom_prompt, api_key=DEEPSEEK_API_KEY,
    api_base=DEEPSEEK_API_BASE, abort_flag=abort_flags[task_id])
            for q in questions:
                if q.get("type") == "单选" and isinstance(q.get("answer"), str) and len(q.get("answer")) > 1:
                    q["type"] = "多选"
                if q.get("type") == "单选" and q.get("options") and len(q["options"]) > 2 and isinstance(q["answer"], str) and len(q["answer"]) > 1:
                    q["type"] = "多选"
            progress_dict[task_id] = {'status': 'done', 'result': questions}
            # 保存到单独文件
            file_name = save_parsed_questions(questions)
            # 保存索引到历史题库，增加origin_name
            history = load_history()
            history.append({'type': 'ai', 'file': file_name, 'origin_name': filename, 'time': time.strftime('%Y-%m-%d %H:%M:%S'), 'model': model})
            save_history(history)
        except Exception as e:
            progress_dict[task_id] = {'status': 'error', 'error': str(e)}
        finally:
            abort_flags.pop(task_id, None)  # 任务结束后清理标志
    thread = threading.Thread(target=run_parse)
    thread.daemon = True
    thread.start()
    return jsonify(success=True, task_id=task_id)

@app.route('/data/parsed/<path:filename>')
def serve_parsed_file(filename):
    import os
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    parsed_dir = os.path.join(base_dir, 'data', 'parsed')
    print('base_dir:', base_dir)
    print('parsed_dir:', parsed_dir)
    print('请求文件:', filename)
    print('文件是否存在:', os.path.exists(os.path.join(parsed_dir, filename)))
    return send_from_directory(parsed_dir, filename)

@app.route('/api/ai_upload_progress')
def ai_upload_progress():
    task_id = request.args.get('task_id')
    prog = progress_dict.get(task_id)
    if not prog:
        return jsonify(success=False, error='无此任务')
    return jsonify(success=True, **prog)

@app.route('/api/abort_task')
def abort_task():
    task_id = request.args.get('task_id')
    if not task_id:
        return jsonify(success=False, error='缺少task_id')
    flag = abort_flags.get(task_id)
    if flag:
        flag.set()
        return jsonify(success=True)
    return jsonify(success=False, error='任务不存在或已结束')

@app.route('/api/delete_history', methods=['POST'])
def delete_history():
    data = request.get_json()
    file_name = data.get('file')
    if not file_name:
        return jsonify(success=False, error='缺少file参数')
    history = load_history()
    # 查找要删除的记录
    new_history = [h for h in history if h.get('file') != file_name]
    if len(new_history) == len(history):
        return jsonify(success=False, error='未找到对应记录')
    save_history(new_history)
    # 删除对应的json文件
    file_path = os.path.join(PARSED_DIR, file_name)
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
    except Exception as e:
        logger.error(f"删除题库文件失败: {e}")
    return jsonify(success=True)

# ========== 收藏题目接口 ==========
@app.route('/api/favorite_question', methods=['POST', 'DELETE'])
def favorite_question():
    """
    POST: 收藏单个题目，保存到 favorites.json，避免重复收藏。
    DELETE: 取消收藏（同步删除 favorites.json 中对应题目）。
    """
    DATA_DIR = './data/parsed'
    FAVORITES_FILE = os.path.join(DATA_DIR, 'favorites.json')
    os.makedirs(DATA_DIR, exist_ok=True)
    try:
        question = request.get_json()
        if not question:
            return jsonify(success=False, error='缺少题目信息')
        # 读取已有收藏
        if os.path.exists(FAVORITES_FILE):
            with open(FAVORITES_FILE, 'r', encoding='utf-8') as f:
                favorites = json.load(f)
        else:
            favorites = []
        # 判重函数
        def question_key(q):
            return json.dumps({
                'content': q.get('content'),
                'options': q.get('options'),
                'answer': q.get('answer'),
                'type': q.get('type')
            }, ensure_ascii=False, sort_keys=True)
        new_key = question_key(question)
        if request.method == 'POST':
            exists = any(question_key(fav) == new_key for fav in favorites)
            if exists:
                return jsonify(success=False, error='该题已收藏')
            favorites.append(question)
            with open(FAVORITES_FILE, 'w', encoding='utf-8') as f:
                json.dump(favorites, f, ensure_ascii=False, indent=2)
            return jsonify(success=True)
        elif request.method == 'DELETE':
            # 同步删除
            new_favorites = [fav for fav in favorites if question_key(fav) != new_key]
            with open(FAVORITES_FILE, 'w', encoding='utf-8') as f:
                json.dump(new_favorites, f, ensure_ascii=False, indent=2)
            return jsonify(success=True)
        else:
            return jsonify(success=False, error='不支持的操作')
    except Exception as e:
        return jsonify(success=False, error=str(e))

@app.route('/css/<path:filename>')
def serve_css(filename):
    return send_from_directory('../css', filename)

@app.route('/js/<path:filename>')
def serve_js(filename):
    return send_from_directory('../js', filename)

@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

if __name__ == '__main__':
    logger.info("启动 Flask API 服务")
    app.run(debug=True)
