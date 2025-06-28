import os
import json
import re
import requests
import uuid
import logging
from docx import Document
import PyPDF2
from concurrent.futures import ThreadPoolExecutor, as_completed

logger = logging.getLogger(__name__)

def extract_text_from_pdf(file_bytes):
    try:
        reader = PyPDF2.PdfReader(file_bytes)
        text = ""
        for page in reader.pages:
            text += page.extract_text() or ""
        return text
    except Exception as e:
        logger.error(f"从PDF提取文本失败: {e}")
        raise RuntimeError(f"无法从PDF文件提取文本: {e}")

def extract_text_from_txt(file_bytes):
    try:
        return file_bytes.decode('utf-8')
    except Exception as e:
        logger.error(f"从TXT提取文本失败: {e}")
        raise RuntimeError(f"无法从TXT文件提取文本: {e}")

logger = logging.getLogger(__name__)

def extract_json_from_text(text):
    """
    从 AI 返回的文本中提取合法 JSON 数组（尝试多种策略提取 JSON）
    """
    try:
        # 策略1：直接尝试解析整个文本
        try:
            data = json.loads(text)
            if isinstance(data, list):
                return data
            elif isinstance(data, dict) and any(isinstance(data.get(k), list) for k in data):
                # 处理可能的嵌套结构，如 {"data": [...], "status": "ok"}
                for k, v in data.items():
                    if isinstance(v, list) and v:
                        return v
            # 如果是其他字典格式，可能是单个题
            elif isinstance(data, dict) and "content" in data:
                return [data]
        except json.JSONDecodeError:
            pass  # 直接解析失败，尝试其他策略
            
        # 策略2：查找 markdown 代码块中的 JSON
        code_blocks = re.findall(r'```json(.*?)```', text, re.DOTALL)
        for block in code_blocks:
            try:
                return json.loads(block)
            except json.JSONDecodeError:
                continue  # 跳过无效 JSON，继续找下一个

        # 策略3：使用正则表达式提取 JSON 数组
        matches = re.findall(r'\[.*?\]', text, re.DOTALL)  # 非贪婪匹配所有数组
        for match in matches:
            try:
                return json.loads(match)
            except json.JSONDecodeError:
                continue  # 跳过无效 JSON，继续找下一个

        raise ValueError("未能提取到合法 JSON 数组")
    except Exception as e:
        raise RuntimeError(f"JSON 提取失败：{e}")
    
def call_deepseek_api(prompt, api_key, model="deepseek-chat", api_base="https://api.deepseek.com/v1", task_id=None):
    url = f"{api_base}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.2,
        "max_tokens": 2048
    }

    task_prefix = f"任务[{task_id}]" if task_id else "AI解析"
    try:
        logger.info(f"{task_prefix} 请求 DeepSeek API...")
        # 增加超时时间到 120 秒
        resp = requests.post(url, headers=headers, json=payload, timeout=120)
        logger.info(f"{task_prefix} DeepSeek 调用完成，状态码：{resp.status_code}")
        if resp.status_code != 200:
            raise RuntimeError(f"DeepSeek接口错误: {resp.status_code} {resp.text}")
        data = resp.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        
        # 修改：安全处理可能包含特殊字符的内容
        try:
            # 只记录前 200 字符，避免日志过大
            truncated_content = content[:200] + ("..." if len(content) > 200 else "")
            # 清理可能导致编码问题的字符
            safe_content = truncated_content.encode('utf-8', errors='replace').decode('utf-8')
            logger.info(f"{task_prefix} AI返回内容(部分)：{safe_content}")
        except Exception as log_error:
            logger.warning(f"{task_prefix} 无法记录AI返回内容：{log_error}")
        
        if not content:
            raise RuntimeError("返回内容为空")

        # 尝试提取 JSON
        questions = extract_json_from_text(content)
        # 修复：确保 questions 一定是 list
        if not isinstance(questions, list):
            # 新增：如果是字符串，尝试json.loads解析
            if isinstance(questions, str):
                try:
                    questions = json.loads(questions)
                except Exception as e:
                    logger.error(f"{task_prefix} 二次解析AI返回的JSON失败: {e}")
                    questions = [{
                        "type": "未知",
                        "content": "AI解析失败",
                        "options": [],
                        "answer": "",
                        "error": questions
                    }]
            else: # 其他非列表类型也包装一下
                questions = [questions]

        # 只保留字典类型的题目项，过滤掉字符串等杂项
        processed_questions = []
        for q in questions:
            # 确保 q 是字典再处理
            if isinstance(q, dict):
                if isinstance(q.get("answer"), list):
                    q["answer"] = "".join(q["answer"])
                processed_questions.append(q)
        # 新增：如果全部被过滤掉，记录AI原始返回内容
        if not processed_questions:
            logger.error(f"{task_prefix} AI返回内容全部被过滤，原始内容：{content}")
        return processed_questions

    except Exception as e:
        logger.error(f"{task_prefix} 调用 DeepSeek 失败：{str(e)}")
        # 返回包含错误信息的列表，以便上层统一处理
        return [{
            "type": "未知",
            "content": "AI API 调用或解析失败",
            "options": [],
            "answer": "",
            "error": str(e)
        }]

def parse_file_with_ai(file_bytes, file_extension, model="deepseek-chat", custom_prompt="", api_key=None, api_base=None, task_id=None, abort_flag=None):
    """
    使用AI解析文件中的题目
    支持外部中断（abort_flag: threading.Event）
    """
    task_prefix = f"任务[{task_id}]" if task_id else "AI解析"
    logger.info(f"{task_prefix} 新请求进入 parse_file_with_ai，文件类型: {file_extension}")
    if abort_flag and abort_flag.is_set():
        raise Exception("任务被中断")

    full_content = ""
    if file_extension == ".docx":
        doc = Document(file_bytes)
        lines = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
        full_content = "\n".join(lines)
    elif file_extension == ".pdf":
        full_content = extract_text_from_pdf(file_bytes)
    elif file_extension == ".txt":
        full_content = extract_text_from_txt(file_bytes)
    else:
        raise ValueError(f"不支持的文件类型: {file_extension}")

    # 新增：过滤掉前面的outline区
    outline_patterns = [
        re.compile(r'重要知识点', re.I),
        re.compile(r'知识点', re.I),
        re.compile(r'提纲', re.I),
        re.compile(r'outline', re.I),
        re.compile(r'目录', re.I),
        re.compile(r'contents?', re.I)
    ]
    in_outline = False
    outline_checked = False  # 新增：只在开头检查一次 outline 区
    filtered_lines = []
    for line in full_content.splitlines():
        line = line.strip()
        if not line: # 跳过空行
            continue
        if abort_flag and abort_flag.is_set():
            raise Exception("任务被中断")
        # 只在开头检查 outline 区
        if not outline_checked:
            if any(pat.search(line) for pat in outline_patterns):
                in_outline = True
                continue
            # 检查是否离开outline区（遇到练习题或题目区）
            if in_outline and re.search(r'练习题|题目|题库|题型|选择题|判断题|填空题', line):
                in_outline = False
                outline_checked = True  # 一旦离开 outline 区，不再进入
                continue  # 跳过本行，下一行才是题目内容
            if in_outline:
                continue
            # 如果没进入 outline 区，遇到题目区直接标记已检查
            if re.search(r'练习题|题目|题库|题型|选择题|判断题|填空题', line):
                outline_checked = True
        filtered_lines.append(line)
    logger.info(f"{task_prefix} 过滤outline后剩余行数：{len(filtered_lines)}")

    # 新增：过滤后内容为空直接返回
    if not filtered_lines:
        logger.error(f"{task_prefix} 过滤后没有题目内容，无法解析。")
        return [{
            "type": "未知",
            "content": "未检测到题目内容，解析失败",
            "options": [],
            "answer": "",
            "error": "过滤后无题目内容"
        }]

    if abort_flag and abort_flag.is_set():
        raise Exception("任务被中断")
    # 直接将全部内容交给AI，不再本地分块
    full_content = "\n".join(filtered_lines)
    logger.info(f"{task_prefix} 直接将全部题目内容交给AI：")
    logger.info(full_content)

    def build_prompt(content):
        if custom_prompt:
            prompt = custom_prompt.replace("{content}", content)
            if "{content}" not in custom_prompt:
                prompt += "\n" + content
        else:
            prompt = f"""你是一个结构化抽取助手。请将以下题目解析为 JSON 数组格式，每题包含：
        - "type"（题型：单选/多选/判断/填空）
        - "content"（题干）
        - "options"（选项，如无则为 [] 空数组）
        - "answer"（答案：单选为选项字母；多选为选项字母拼接的字符串；判断题为 "True" 或 "False"；填空题为答案数组）
只返回 JSON 数组，数组内每个元素必须是题目对象，不要添加任何解释性文字、注释、字符串或 markdown 代码块。
题目内容如下：
{content}
"""
        return prompt

    # 优先使用参数，其次环境变量
    real_api_key = api_key or os.environ.get("DEEPSEEK_API_KEY")
    real_api_base = api_base or os.environ.get("DEEPSEEK_API_BASE", "https://api.deepseek.com/v1")
    logger.info(f"{task_prefix} 使用API KEY: {'已提供' if real_api_key else '未提供'}，API BASE: {real_api_base}")

    prompt = build_prompt(full_content)
    results = []
    try:
        if abort_flag and abort_flag.is_set():
            raise Exception("任务被中断")
        res = call_deepseek_api(
            prompt,
            real_api_key,
            model,
            real_api_base,
            task_id
        )
        if abort_flag and abort_flag.is_set():
            raise Exception("任务被中断")
        logger.info(f"{task_prefix} AI原始返回内容：{res}")
        results.extend(res)
        logger.info(f"{task_prefix} AI解析完成，最终题目数：{len(results)}")
        if not results:
            logger.error(f"{task_prefix} AI返回内容为空，解析失败。")
            return [{
                "type": "未知",
                "content": "AI返回内容为空，解析失败",
                "options": [],
                "answer": "",
                "error": "AI返回内容为空"
            }]
    except Exception as e:
        results.append({
            "type": "未知",
            "content": "AI解析失败",
            "options": [],
            "answer": "",
            "error": str(e)
        })
    return results
