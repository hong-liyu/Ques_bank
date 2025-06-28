
# 1.建议创建虚拟环境
## If conda
1. conda create -n ques_bank

## If vene
python -m venv ques_bank
ques_bank\Scripts\activate  # Windows

# 2.安装依赖
pip install -r requirements.txt


# 启动
    1. 方法一：python app.py
    进入终端返回的网址即可：http://127.0.0.1:5000/
    2. 方法二：python main.py(保证在对应环境里面)