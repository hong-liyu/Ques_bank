import json
import uuid
import os
import time

files_to_convert = ['积极分子 (1).json', '积极分子 (2).json']
history_path = 'data/parsed_questions.json'
parsed_dir = 'data/parsed'

if not os.path.exists(parsed_dir):
    os.makedirs(parsed_dir)

history = []
if os.path.exists(history_path):
    with open(history_path, 'r', encoding='utf-8') as f:
        history = json.load(f)

for fname in files_to_convert:
    if not os.path.exists(fname):
        print(f"File {fname} not found.")
        continue
    
    with open(fname, 'r', encoding='utf-8') as f:
        raw_data = json.load(f)
        
    formatted_data = []
    for item in raw_data:
        q_text = item.get('question', '')
        
        q_type = "单选"
        if "【单选" in q_text:
            q_type = "单选"
        elif "【多选" in q_text:
            q_type = "多选"
        elif "【判断" in q_text:
            q_type = "判断"
        elif "【填空" in q_text:
            q_type = "填空"
        else:
            ans = item.get('answer', '')
            if item.get('options'):
                if len(ans) > 1 and '|' not in ans:
                    q_type = "多选"
                else:
                    q_type = "单选"
            else:
                if ans in ['True', 'False', '正确', '错误', '对', '错']:
                    q_type = "判断"
                else:
                    q_type = "填空"
                    
        formatted_item = {
            'type': q_type,
            'content': q_text,
            'options': item.get('options', []),
            'answer': item.get('answer', ''),
        }
        if 'analysis' in item:
            formatted_item['analysis'] = item['analysis']
            
        formatted_data.append(formatted_item)
        
    file_id = str(uuid.uuid4())
    new_filename = f"parsed_{file_id}.json"
    new_filepath = os.path.join(parsed_dir, new_filename)
    
    with open(new_filepath, 'w', encoding='utf-8') as f:
        json.dump(formatted_data, f, ensure_ascii=False, indent=2)
        
    history.append({
        "type": "import",
        "file": new_filename,
        "origin_name": fname,
        "time": time.strftime('%Y-%m-%d %H:%M:%S'),
        "model": "manual-import",
        "stats": {
            "completed_runs": 0,
            "total_answered": 0,
            "total_correct": 0,
            "last_completed_at": None
        }
    })

with open(history_path, 'w', encoding='utf-8') as f:
    json.dump(history, f, ensure_ascii=False, indent=2)

print("Import successful!")
