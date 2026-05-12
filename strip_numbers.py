import json
import re

files = [
    'data/parsed/parsed_4ab480d7-e423-4f50-9182-1ab99ecb037e.json',
    'data/parsed/parsed_ee4c7d38-3b63-44d7-9690-cc39aa2160d3.json'
]

pattern = re.compile(r'^(\d+[\.、\s]+)(.*)', re.DOTALL)

for fname in files:
    try:
        with open(fname, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        for item in data:
            content = item.get('content', '')
            match = pattern.match(content)
            if match:
                item['content'] = match.group(2).strip()
                
        with open(fname, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"Successfully processed: {fname}")
    except Exception as e:
        print(f"Error processing {fname}: {e}")
