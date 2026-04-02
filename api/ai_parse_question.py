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
    
def call_deepseek_api(prompt, api_key, model="deepseek-chat", api_base="https://api.deepseek.com/v1", task_id=None, max_tokens=6144):
    """调用 DeepSeek API 解析题目
    
    参数:
      max_tokens: 最大生成 token 数，默认 6144（从 2048 升级）
                  含代码段的题库建议使用 6144-8192
    """
    url = f"{api_base}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.2,
        "max_tokens": max_tokens  # 参数化而非硬编码
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
                # 改进：支持多答案格式（用 | 分隔符）
                if isinstance(q.get("answer"), list):
                    # 列表转字符串：多答案用 | 分隔
                    # 例如：["答案1", "答案2"] → "答案1|答案2"
                    answer_list = [str(a).strip() for a in q["answer"] if a]
                    q["answer"] = "|".join(answer_list) if answer_list else ""
                elif isinstance(q.get("answer"), str):
                    # 保持原字符串，可能已含 | 分隔符
                    q["answer"] = q["answer"].strip()
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

def parse_file_with_ai(file_bytes, file_extension, model="deepseek-chat", custom_prompt="", api_key=None, api_base=None, task_id=None, abort_flag=None, progress_callback=None):
    """
    使用AI解析文件中的题目
    支持外部中断（abort_flag: threading.Event）
    """
    task_prefix = f"任务[{task_id}]" if task_id else "AI解析"
    logger.info(f"{task_prefix} 新请求进入 parse_file_with_ai，文件类型: {file_extension}")
    if abort_flag and abort_flag.is_set():
        raise Exception("任务被中断")

    if progress_callback: progress_callback(5, '正在提取文件文本...')
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
    
    if progress_callback: progress_callback(15, '正在过滤非相关内容与整理排版...')

    # 合并题目内容并进行长度检查
    full_content = "\n".join(filtered_lines)
    content_length = len(full_content)
    estimated_tokens = content_length // 3  # 粗略估算：1 token ≈ 3 汉字/字符
    
    logger.info(f"{task_prefix} 题目内容统计：{content_length} 字符，估约 {estimated_tokens} tokens")
    
    # 警告过大的内容（接近 max_tokens 限制）
    if estimated_tokens > 4096:
        logger.warning(f"{task_prefix} ⚠️ 警告：题目内容较大（{estimated_tokens} tokens），建议：")
        logger.warning(f"{task_prefix}    1) 分次上传（拆分文件）")
        logger.warning(f"{task_prefix}    2) 或在调用时增加 max_tokens 参数到 8192")
    
    if progress_callback: progress_callback(30, '正在请求 AI 进行解析... (可能需要10-60秒，请耐心等待)')
    logger.info(f"{task_prefix} 将题目内容交给 AI 解析（无本地分块）")

    def build_prompt(content):
        if custom_prompt:
            prompt = custom_prompt.replace("{content}", content)
            if "{content}" not in custom_prompt:
                prompt += "\n" + content
        else:
            # v2.0 版本提示词：专业级结构化提示，含完整的代码排版规范
            prompt = f"""你是一个专业的结构化题目抽取助手。请将以下题目解析为 JSON 数组。

## 输出格式

返回一个 JSON 数组，每题包含字段：
- "type"：题型（单选/多选/判断/填空）
- "content"：题干。若含代码，**必须按下述规范使用 Markdown**
- "options"：选项列表，无则为 []
- "answer"：答案文本

## 【代码块 Markdown 规范】

**格式**：
```[语言标签]
代码内容
```

**示例**：
```cpp
#include <iostream>
using namespace std;
int main() {{
    cout << "Hello" << endl;
    return 0;
}}
```

**代码排版要求**（重点）：
1. 使用三反引号 + 语言标签（cpp, python, java, javascript, sql, html, css, bash, shell, json, xml, yaml, plaintext 等）
2. 严格保留原始的缩进、换行和代码格式
3. 代码块内部必须保持紧凑：勿在代码块开头、结尾或两行代码之间添加额外空白行
4. 保持原代码风格：运算符周围的空格（如 `cout << x << y;`）要保留，勿修改
5. 预期效果：渲染后代码块整洁紧凑，无多余留白，易于阅读

## 答案格式

- **单选**：单个字母，如 `"A"`
- **多选**：用 | 分隔，如 `"A|B"` 或 `"A|C|D"`
- **判断**：`"True"` 或 `"False"`
- **填空**：答案文本。多答案用 | 分隔，如 `"答案1|答案2|答案3"`

## 关键要求

1. 只返回 JSON 数组，无额外文本、markdown 代码块、解释或注释
2. 代码块在 content 中用 Markdown 格式，不放在 options 中
3. 严格 JSON 格式：正确的引号、逗号、方括号、花括号
4. 保留原始格式：题干的换行、缩进、特殊字符都要保留

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
        
        # 根据内容大小动态调整 max_tokens
        # 基础值：6144 tokens。内容越大，max_tokens 越需要增加
        dynamic_max_tokens = max(6144, estimated_tokens + 1024)
        logger.info(f"{task_prefix} 使用动态 max_tokens: {dynamic_max_tokens}（基础 6144 + 预留 1024）")
        
        # 为了展示进度，传入 progress_callback（可在call_deepseek_api内部做更细粒度进度，但目前可保持简单）
        res = call_deepseek_api(
            prompt,
            real_api_key,
            model,
            real_api_base,
            task_id,
            max_tokens=dynamic_max_tokens  # 参数化，而非硬编码的 2048
        )
        
        if progress_callback: progress_callback(90, '正在将 AI 提取的数据整理为标准格式...')

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
