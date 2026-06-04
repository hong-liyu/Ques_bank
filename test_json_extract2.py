import json
import re

text = """```json
[
    {
        "type": "单选",
        "content": "下列关于编译预处理命令的说法，正确的是（ ）。\nA. 预处理命令是在程序编译完成后执行的\nB. 预处理命令必须以分号结尾，否则会编译错误\nC. 预处理命令可以出现在程序的任何位置，但通常放在文件开头\nD. 预处理命令只能用于定义常量和宏",
        "options": [],
        "answer": "C"
    }
]
```"""

print("--- Testing JSON loading ---")
try:
    print('Raw loads:', json.loads(text, strict=False))
except Exception as e:
    print('Raw loads failed:', e)

code_blocks = re.findall(r'```json(.*?)```', text, re.DOTALL)
for block in code_blocks:
    print('Block:', repr(block))
    try:
        print('Block loads:', json.loads(block, strict=False))
    except Exception as e:
        print('Block loads failed:', e)

print("--- Testing json-repair (if we need it) ---")
# Manually escaping newlines in strings
def escape_newlines_in_strings(json_string):
    # A simple regex to find unescaped newlines inside strings is hard, 
    # but we can try to fix standard control chars.
    # Actually, a better approach is to use regex to find strings and escape them.
    # Let's see if simple replacement works:
    # We replace literal \n with \\n, but only if they are not already escaped.
    # Wait, the string above HAS literal \n. Let's see how python reads it.
    pass

def sanitize_json(text):
    # Often, LLMs output actual newline characters inside the string value.
    # A robust way is to just replace actual newline characters with \\n, 
    # but ONLY inside double quotes. 
    # But an easier hack for JSON arrays is just to escape all newlines that are not part of the standard JSON formatting? No, that's hard.
    
    # What if we just do:
    # 1. Extract the JSON block
    # 2. Convert literal newlines to \n
    # 3. Then json.loads?
    
    # Let's test standard json.loads with strict=False first.
    return text

