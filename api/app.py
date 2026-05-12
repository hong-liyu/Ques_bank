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

# 历史题库持久化相关配置 - 使用绝对路径避免后台线程路径问题
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, 'data')
HISTORY_FILE = os.path.join(DATA_DIR, 'parsed_questions.json')
PARSED_DIR = os.path.join(DATA_DIR, 'parsed')
ASSETS_DIR = os.path.join(BASE_DIR, 'assets')
FAVORITES_FILE = os.path.join(PARSED_DIR, 'favorites.json')


def default_stats():
    return {
        'completed_runs': 0,
        'total_answered': 0,
        'total_correct': 0,
        'last_completed_at': None
    }


def normalize_history_record(record):
    normalized = dict(record or {})
    raw_stats = normalized.get('stats') or {}
    stats = default_stats()

    for key in ('completed_runs', 'total_answered', 'total_correct'):
        try:
            stats[key] = max(0, int(raw_stats.get(key, stats[key])))
        except (TypeError, ValueError):
            stats[key] = 0

    last_completed_at = raw_stats.get('last_completed_at')
    stats['last_completed_at'] = last_completed_at if isinstance(last_completed_at, str) and last_completed_at.strip() else None
    normalized['stats'] = stats
    return normalized

# 工具函数：加载历史题库
def load_history():
    if not os.path.exists(HISTORY_FILE):
        return []
    try:
        with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
            history = json.load(f)
        if not isinstance(history, list):
            return []
        return [normalize_history_record(item) for item in history]
    except Exception as e:
        logger.error(f"读取历史题库失败: {e}")
        return []

# 工具函数：保存历史题库
def save_history(history):
    os.makedirs(DATA_DIR, exist_ok=True)
    try:
        file_path = os.path.join(DATA_DIR, 'parsed_questions.json')
        logger.info(f"保存历史题库到: {os.path.abspath(file_path)}")
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump([normalize_history_record(item) for item in history], f, ensure_ascii=False, indent=2)
        logger.info(f"历史题库保存成功，共 {len(history)} 条记录")
    except Exception as e:
        logger.error(f"保存历史题库失败: {e}")

# 工具函数：保存单次解析结果到独立文件
def save_parsed_questions(questions):
    os.makedirs(PARSED_DIR, exist_ok=True)
    file_id = str(uuid.uuid4())
    file_name = f'parsed_{file_id}.json'
    file_path = os.path.join(PARSED_DIR, file_name)
    logger.info(f"保存解析结果到: {os.path.abspath(file_path)}")
    try:
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(questions, f, ensure_ascii=False, indent=2)
        logger.info(f"解析结果保存成功，文件: {file_name}，题目数: {len(questions)}")
    except Exception as e:
        logger.error(f"保存解析结果失败: {e}")
        raise
    return file_name


def default_favorites_data():
    return {
        'folders': [],
        'items': []
    }


def favorite_question_key(question):
    return json.dumps({
        'content': question.get('content'),
        'options': question.get('options'),
        'answer': question.get('answer'),
        'type': question.get('type')
    }, ensure_ascii=False, sort_keys=True)


def normalize_favorites_data(data):
    default_folder_id = 'default-folder'
    now_text = time.strftime('%Y-%m-%d %H:%M:%S')

    if isinstance(data, list):
        return {
            'folders': [{
                'id': default_folder_id,
                'name': '默认收藏夹',
                'created_at': now_text
            }],
            'items': [{
                'id': str(uuid.uuid4()),
                'folder_id': default_folder_id,
                'folder_name': '默认收藏夹',
                'source_file': None,
                'source_title': '未标记来源',
                'type': item.get('type'),
                'content': item.get('content'),
                'options': item.get('options'),
                'answer': item.get('answer'),
                'created_at': now_text
            } for item in data if isinstance(item, dict)]
        }

    normalized = default_favorites_data()
    if isinstance(data, dict):
        folders = data.get('folders')
        items = data.get('items')

        if isinstance(folders, list):
            for folder in folders:
                if not isinstance(folder, dict):
                    continue
                folder_id = str(folder.get('id') or uuid.uuid4())
                folder_name = str(folder.get('name') or '未命名收藏夹').strip() or '未命名收藏夹'
                normalized['folders'].append({
                    'id': folder_id,
                    'name': folder_name,
                    'created_at': folder.get('created_at') or now_text
                })

        folder_map = {folder['id']: folder['name'] for folder in normalized['folders']}

        if isinstance(items, list):
            for item in items:
                if not isinstance(item, dict):
                    continue
                folder_id = str(item.get('folder_id') or default_folder_id)
                folder_name = item.get('folder_name') or folder_map.get(folder_id) or '默认收藏夹'
                if folder_id not in folder_map:
                    normalized['folders'].append({
                        'id': folder_id,
                        'name': folder_name,
                        'created_at': now_text
                    })
                    folder_map[folder_id] = folder_name
                normalized['items'].append({
                    'id': str(item.get('id') or uuid.uuid4()),
                    'folder_id': folder_id,
                    'folder_name': folder_name,
                    'source_file': item.get('source_file'),
                    'source_title': item.get('source_title') or '未标记来源',
                    'type': item.get('type'),
                    'content': item.get('content'),
                    'options': item.get('options'),
                    'answer': item.get('answer'),
                    'created_at': item.get('created_at') or now_text
                })

    return normalized


def load_favorites_data():
    os.makedirs(PARSED_DIR, exist_ok=True)
    if not os.path.exists(FAVORITES_FILE):
        return default_favorites_data()
    try:
        with open(FAVORITES_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        normalized = normalize_favorites_data(data)
        if normalized != data:
            save_favorites_data(normalized)
        return normalized
    except Exception as e:
        logger.error(f"读取收藏数据失败: {e}")
        return default_favorites_data()


def save_favorites_data(data):
    os.makedirs(PARSED_DIR, exist_ok=True)
    normalized = normalize_favorites_data(data)
    with open(FAVORITES_FILE, 'w', encoding='utf-8') as f:
        json.dump(normalized, f, ensure_ascii=False, indent=2)


def build_favorite_folder_summary(data):
    counts = {}
    for item in data.get('items', []):
        folder_id = item.get('folder_id')
        counts[folder_id] = counts.get(folder_id, 0) + 1

    return [{
        **folder,
        'count': counts.get(folder.get('id'), 0)
    } for folder in data.get('folders', [])]

# ========== 新增：历史题库接口 ==========
@app.route('/api/history_questions')
def history_questions():
    """
    获取所有历史题库，并验证文件是否真实存在
    自动删除指向不存在文件的记录（清理孤立记录）
    """
    try:
        history = load_history()
        # 验证每个记录的文件是否存在
        valid_history = []
        for record in history:
            file_path = os.path.join(PARSED_DIR, record.get('file', ''))
            if os.path.exists(file_path):
                valid_history.append(normalize_history_record(record))
            else:
                logger.warning(f"历史记录指向不存在的文件，已移除: {record.get('file')}")
        
        # 如果有删除的记录，更新历史文件
        if len(valid_history) < len(history):
            logger.info(f"清理孤立记录: 删除 {len(history) - len(valid_history)} 条")
            save_history(valid_history)
        
        return jsonify(success=True, history=valid_history)
    except Exception as e:
        logger.error(f"获取历史题库失败: {e}")
        return jsonify(success=False, error=str(e)), 500

@app.route('/api/upload_question', methods=['POST'])
def upload_question():
    file = request.files.get('file')
    if not file or not file.filename.endswith('.docx'):
        return jsonify(success=False, error='仅支持 docx 文件')
    custom_name = request.form.get('custom_name', '').strip()
    try:
        logger.info("收到文件，开始解析 docx ...")
        doc = Document(file)
        lines = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
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
        origin_name = custom_name if custom_name else file.filename
        history.append({
            'type': 'local',
            'file': file_name,
            'origin_name': origin_name,
            'time': time.strftime('%Y-%m-%d %H:%M:%S'),
            'stats': default_stats()
        })
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
    
    supported_extensions = ['.docx', '.pdf', '.txt', '.md', '.json']
    if file_extension not in supported_extensions:
        return jsonify(success=False, error=f'不支持的文件类型: {file_extension}，目前仅支持 {", ".join(supported_extensions)}')

    custom_prompt = request.form.get('custom_prompt', '').strip()
    custom_name = request.form.get('custom_name', '').strip()
    model = request.form.get('model', 'deepseek-chat')
    file_bytes = file.read()
    task_id = str(uuid.uuid4())
    progress_dict[task_id] = {'status': 'pending', 'percent': 0, 'msg': '准备上传...'}
    abort_flags[task_id] = threading.Event()  # 新增：为任务创建中断标志
    logger.info(f"创建AI解析任务：{task_id}，模型：{model}，文件类型：{file_extension}")

    def run_parse():
        import io
        try:
            def progress_callback(percent, msg):
                progress_dict[task_id]['percent'] = percent
                progress_dict[task_id]['msg'] = msg
                logger.info(f"任务[{task_id}] 进度：{percent}% - {msg}")

            # 新增：传递abort_flag给AI解析与进度回调
            questions = parse_file_with_ai(io.BytesIO(file_bytes), file_extension, model=model, custom_prompt=custom_prompt, api_key=DEEPSEEK_API_KEY,
    api_base=DEEPSEEK_API_BASE, abort_flag=abort_flags[task_id], progress_callback=progress_callback)
            
            if progress_callback: progress_callback(95, '保存并序列化解析结果...')
            
            for q in questions:
                if q.get("type") == "单选" and isinstance(q.get("answer"), str) and len(q.get("answer")) > 1:
                    q["type"] = "多选"
                if q.get("type") == "单选" and q.get("options") and len(q["options"]) > 2 and isinstance(q["answer"], str) and len(q["answer"]) > 1:
                    q["type"] = "多选"
            
            progress_dict[task_id] = {'status': 'done', 'result': questions, 'percent': 100, 'msg': '解析完成'}
            
            # 保存到单独文件
            file_name = save_parsed_questions(questions)
            # 保存索引到历史题库，增加origin_name
            history = load_history()
            origin_name = custom_name if custom_name else filename
            history.append({
                'type': 'ai',
                'file': file_name,
                'origin_name': origin_name,
                'time': time.strftime('%Y-%m-%d %H:%M:%S'),
                'model': model,
                'stats': default_stats()
            })
            save_history(history)
        except Exception as e:
            progress_dict[task_id] = {'status': 'error', 'error': str(e), 'percent': 0, 'msg': '出现错误'}
        finally:
            abort_flags.pop(task_id, None)  # 任务结束后清理标志
    thread = threading.Thread(target=run_parse)
    thread.daemon = True
    thread.start()
    return jsonify(success=True, task_id=task_id)

@app.route('/data/parsed/<path:filename>')
def serve_parsed_file(filename):
    """
    提供解析后的题库JSON文件
    """
    try:
        file_path = os.path.join(PARSED_DIR, filename)
        
        # 安全检查：确保请求的文件在允许的目录内
        if not os.path.abspath(file_path).startswith(os.path.abspath(PARSED_DIR)):
            logger.warning(f"非法访问: {file_path}")
            return jsonify(success=False, error='非法访问'), 403
        
        if not os.path.exists(file_path):
            logger.warning(f"请求的文件不存在: {file_path}")
            return jsonify(success=False, error='文件不存在'), 404
        
        logger.info(f"提供文件: {file_path}")
        return send_from_directory(PARSED_DIR, filename)
    except Exception as e:
        logger.error(f"提供文件失败: {e}")
        return jsonify(success=False, error=str(e)), 500

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

@app.route('/api/rename_question', methods=['POST'])
def rename_question():
    """重命名题库文件，更新索引中的 origin_name"""
    data = request.get_json()
    old_file = data.get('old_file')
    new_name = data.get('new_name')
    
    if not old_file or not new_name:
        return jsonify(success=False, error='缺少参数：old_file 或 new_name')
    
    new_name = new_name.strip()
    if not new_name:
        return jsonify(success=False, error='新名称不能为空')
    
    history = load_history()
    
    # 查找对应的记录
    item_found = False
    for item in history:
        if item.get('file') == old_file:
            item['origin_name'] = new_name  # 更新名称
            item_found = True
            break
    
    if not item_found:
        return jsonify(success=False, error='未找到对应的题库记录')
    
    # 保存更新后的历史记录
    try:
        save_history(history)
        logger.info(f"成功重命名题库: {old_file} -> {new_name}")
        return jsonify(success=True, message='重命名成功')
    except Exception as e:
        logger.error(f"保存重命名失败: {e}")
        return jsonify(success=False, error=f'保存失败: {str(e)}')

# ========== 收藏题目接口 ==========
@app.route('/api/quiz_session_complete', methods=['POST'])
def quiz_session_complete():
    data = request.get_json() or {}
    file_name = data.get('file')
    completed_at = data.get('completed_at')

    if not file_name:
        return jsonify(success=False, error='missing file parameter'), 400

    try:
        answered_count = max(0, int(data.get('answered_count', 0)))
        correct_count = max(0, int(data.get('correct_count', 0)))
        duration_seconds = max(0, int(data.get('duration_seconds', 0)))
    except (TypeError, ValueError):
        return jsonify(success=False, error='invalid answered_count, correct_count, or duration_seconds'), 400

    history = load_history()
    target = next((item for item in history if item.get('file') == file_name), None)

    if not target:
        return jsonify(success=False, error='quiz not found'), 404

    stats = normalize_history_record(target).get('stats', default_stats())
    stats['completed_runs'] += 1
    stats['total_answered'] += answered_count
    stats['total_correct'] += min(correct_count, answered_count)
    stats['last_completed_at'] = completed_at if isinstance(completed_at, str) and completed_at.strip() else time.strftime('%Y-%m-%d %H:%M:%S')
    target['stats'] = stats

    save_history(history)
    return jsonify(success=True, stats=stats, duration_seconds=duration_seconds)


@app.route('/api/favorite_question_legacy_unused', methods=['GET', 'POST', 'DELETE'])
def favorite_question_legacy_unused():
    """
    GET: 获取所有收藏的题目
    POST: 收藏单个题目，保存到 favorites.json，避免重复收藏。
    DELETE: 取消收藏（同步删除 favorites.json 中对应题目）。
    """
    FAVORITES_FILE = os.path.join(PARSED_DIR, 'favorites.json')
    os.makedirs(PARSED_DIR, exist_ok=True)
    try:
        if request.method == 'GET':
            # 直接读取并返回 favorites.json 中的所有收藏
            if os.path.exists(FAVORITES_FILE):
                with open(FAVORITES_FILE, 'r', encoding='utf-8') as f:
                    favorites = json.load(f)
            else:
                favorites = []
            return jsonify(success=True, favorites=favorites)
        
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

@app.route('/api/favorite_folders', methods=['GET', 'POST'])
def favorite_folders():
    try:
        data = load_favorites_data()
        if request.method == 'GET':
            return jsonify(success=True, folders=build_favorite_folder_summary(data))

        payload = request.get_json() or {}
        name = str(payload.get('name') or '').strip()
        if not name:
            return jsonify(success=False, error='收藏夹名称不能为空'), 400

        exists = any(folder.get('name', '').strip().lower() == name.lower() for folder in data.get('folders', []))
        if exists:
            return jsonify(success=False, error='收藏夹名称已存在'), 400

        folder = {
            'id': str(uuid.uuid4()),
            'name': name,
            'created_at': time.strftime('%Y-%m-%d %H:%M:%S')
        }
        data['folders'].append(folder)
        save_favorites_data(data)
        return jsonify(success=True, folder={**folder, 'count': 0})
    except Exception as e:
        logger.error(f"收藏夹接口失败: {e}")
        return jsonify(success=False, error=str(e)), 500


@app.route('/api/favorite_questions', methods=['GET', 'POST', 'DELETE'])
def favorite_questions():
    try:
        data = load_favorites_data()

        if request.method == 'GET':
            folder_id = request.args.get('folder_id')
            items = data.get('items', [])
            if folder_id:
                items = [item for item in items if item.get('folder_id') == folder_id]
            return jsonify(success=True, items=items, folders=build_favorite_folder_summary(data))

        payload = request.get_json() or {}
        folder_id = str(payload.get('folder_id') or '').strip()
        if not folder_id:
            return jsonify(success=False, error='缺少 folder_id'), 400

        folder = next((item for item in data.get('folders', []) if item.get('id') == folder_id), None)
        if not folder:
            return jsonify(success=False, error='收藏夹不存在'), 404

        question = {
            'content': payload.get('content'),
            'options': payload.get('options'),
            'answer': payload.get('answer'),
            'type': payload.get('type')
        }
        question_key = favorite_question_key(question)

        if request.method == 'POST':
            exists = next((
                item for item in data.get('items', [])
                if item.get('folder_id') == folder_id and favorite_question_key(item) == question_key
            ), None)
            if exists:
                return jsonify(success=False, error='该题已在当前收藏夹中'), 400

            favorite_item = {
                'id': str(uuid.uuid4()),
                'folder_id': folder_id,
                'folder_name': folder.get('name'),
                'source_file': payload.get('source_file'),
                'source_title': payload.get('source_title') or '未标记来源',
                'type': payload.get('type'),
                'content': payload.get('content'),
                'options': payload.get('options'),
                'answer': payload.get('answer'),
                'created_at': time.strftime('%Y-%m-%d %H:%M:%S')
            }
            data['items'].append(favorite_item)
            save_favorites_data(data)
            return jsonify(success=True, item=favorite_item, folders=build_favorite_folder_summary(data))

        item_id = payload.get('item_id')
        removed = False
        if item_id:
            new_items = [item for item in data.get('items', []) if item.get('id') != item_id]
            removed = len(new_items) != len(data.get('items', []))
            data['items'] = new_items
        else:
            new_items = []
            for item in data.get('items', []):
                same_folder = item.get('folder_id') == folder_id
                same_question = favorite_question_key(item) == question_key
                if same_folder and same_question and not removed:
                    removed = True
                    continue
                new_items.append(item)
            data['items'] = new_items

        if not removed:
            return jsonify(success=False, error='未找到要移除的收藏'), 404

        save_favorites_data(data)
        return jsonify(success=True, folders=build_favorite_folder_summary(data))
    except Exception as e:
        logger.error(f"收藏题目接口失败: {e}")
        return jsonify(success=False, error=str(e)), 500


@app.route('/api/favorite_question', methods=['GET', 'POST', 'DELETE'])
def favorite_question_legacy():
    data = load_favorites_data()
    if request.method == 'GET':
        return jsonify(success=True, favorites=data.get('items', []))

    payload = request.get_json() or {}
    if not data.get('folders'):
        folder = {
            'id': str(uuid.uuid4()),
            'name': '默认收藏夹',
            'created_at': time.strftime('%Y-%m-%d %H:%M:%S')
        }
        data['folders'].append(folder)
        save_favorites_data(data)
    payload['folder_id'] = payload.get('folder_id') or data['folders'][0]['id']

    with app.test_request_context(
        '/api/favorite_questions',
        method=request.method,
        json=payload
    ):
        return favorite_questions()


@app.route('/api/split_question_bank', methods=['POST'])
def split_question_bank():
    payload = request.get_json() or {}
    file_name = payload.get('file')
    mode = payload.get('mode')
    delete_original = bool(payload.get('delete_original', False))

    if not file_name or not mode:
        return jsonify(success=False, error='缺少 file 或 mode'), 400

    file_path = os.path.join(PARSED_DIR, file_name)
    if not os.path.exists(file_path):
        return jsonify(success=False, error='题库文件不存在'), 404

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            questions = json.load(f)
    except Exception as e:
        return jsonify(success=False, error=f'读取题库失败: {e}'), 500

    if not isinstance(questions, list) or len(questions) < 2:
        return jsonify(success=False, error='题目数量不足，无法拆分'), 400

    if mode == 'even':
        split_index = (len(questions) + 1) // 2
    elif mode == 'range':
        try:
            split_index = int(payload.get('split_point', 0))
        except (TypeError, ValueError):
            return jsonify(success=False, error='split_point 必须是整数'), 400
    else:
        return jsonify(success=False, error='不支持的拆分模式'), 400

    if split_index <= 0 or split_index >= len(questions):
        return jsonify(success=False, error='拆分位置超出范围'), 400

    first_questions = questions[:split_index]
    second_questions = questions[split_index:]
    history = load_history()
    source_item = next((item for item in history if item.get('file') == file_name), None)
    source_title = (source_item or {}).get('origin_name') or file_name
    now_text = time.strftime('%Y-%m-%d %H:%M:%S')

    if mode == 'even':
        first_title = f'{source_title}（上半）'
        second_title = f'{source_title}（下半）'
    else:
        first_title = f'{source_title}（1-{split_index}）'
        second_title = f'{source_title}（{split_index + 1}-{len(questions)}）'

    first_file = save_parsed_questions(first_questions)
    second_file = save_parsed_questions(second_questions)

    created_records = [
        {
            'type': (source_item or {}).get('type', 'split'),
            'file': first_file,
            'origin_name': first_title,
            'time': now_text,
            'model': (source_item or {}).get('model'),
            'stats': default_stats(),
            'split_from': file_name
        },
        {
            'type': (source_item or {}).get('type', 'split'),
            'file': second_file,
            'origin_name': second_title,
            'time': now_text,
            'model': (source_item or {}).get('model'),
            'stats': default_stats(),
            'split_from': file_name
        }
    ]

    history.extend(created_records)

    if delete_original:
        history = [item for item in history if item.get('file') != file_name]
        try:
            os.remove(file_path)
        except OSError as e:
            logger.error(f"删除原题库失败: {e}")

    save_history(history)
    return jsonify(success=True, created=created_records, deleted_original=delete_original)


@app.route('/css/<path:filename>')
def serve_css(filename):
    return send_from_directory('../css', filename)

@app.route('/js/<path:filename>')
def serve_js(filename):
    return send_from_directory('../js', filename)

@app.route('/assets/<path:filename>')
def serve_assets(filename):
    return send_from_directory(ASSETS_DIR, filename)

@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

if __name__ == '__main__':
    logger.info("启动 Flask API 服务")
    app.run(host="0.0.0.0", port=5000, debug=True)
