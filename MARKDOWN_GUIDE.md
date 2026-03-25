# Markdown + 代码高亮使用指南

## 🎯 概述

你现在可以在**问题的 `content` 字段**中使用 Markdown 格式编写代码和文本。系统会自动：
1. ✅ 解析 Markdown 格式
2. ✅ 对代码块进行语法高亮
3. ✅ 美化内联代码

---

## 📝 基本语法

### 1. 代码块（带语法高亮）

```markdown
\`\`\`cpp
#include <iostream>
using namespace std;
int main() {
    cout << "Hello World" << endl;
    return 0;
}
\`\`\`
```

**在 JSON 中的写法**：
```json
{
    "content": "以下代码的输出是什么？\n\n```cpp\n#include <iostream>\nusing namespace std;\nint main() {\n    cout << \"Hello World\" << endl;\n    return 0;\n}\n```"
}
```

**支持的语言标签**：
- `cpp` / `c++` - C++ 代码
- `python` - Python 代码
- `java` - Java 代码
- `javascript` / `js` - JavaScript 代码
- `csharp` / `cs` - C# 代码
- `sql` - SQL 语句
- `html` / `xml` - HTML/XML
- `css` - CSS 样式
- `bash` / `shell` - Shell 脚本
- 等等... (highlight.js 支持 180+ 种语言)

### 2. 内联代码

使用单反引号包围关键字：

```markdown
关于 `cin` 和 `cout` 函数的说法：
```

**在 JSON 中的写法**：
```json
{
    "content": "关于 `cin` 和 `cout` 函数的说法："
}
```

**渲染效果**：
- 浅灰色背景（#f5f5f5）
- 红色文字（#d32f2f）
- 单行不换行（`white-space: nowrap`）

### 3. 列表

```markdown
C++ 的基本特性：
- 面向对象编程
- 泛型编程
- 函数式编程
```

**在 JSON 中的写法**：
```json
{
    "content": "C++ 的基本特性：\n- 面向对象编程\n- 泛型编程\n- 函数式编程"
}
```

### 4. 强调和斜体

```markdown
**粗体重点** - 用于强调重要概念
*斜体说明* - 用于补充说明
```

**在 JSON 中的写法**：
```json
{
    "content": "**粗体重点**说明 和 *斜体说明*"
}
```

### 5. 引用块

```markdown
> 这是一个引用
> 可以多行
```

**在 JSON 中的写法**：
```json
{
    "content": "> 这是重要提示\n> 记住这个概念"
}
```

### 6. 表格（可选）

```markdown
| 符号 | 含义 | 示例 |
|------|------|------|
| `<<` | 插入运算符 | cout << x |
| `>>` | 提取运算符 | cin >> x |
```

---

## 🎨 样式细节

### 代码块样式

| 属性 | 值 |
|------|------|
| 背景色 | #1e1e1e（深灰黑） |
| 文字色 | #e0e0e0（浅灰） |
| 圆角 | 8px |
| 内边距 | 16px |
| 边框 | 1px solid #333333 |
| 字体 | Monaco, Menlo, Ubuntu Mono, Courier New |
| 行高 | 1.5 |
| 阴影 | 0 4px 12px rgba(0,0,0,0.15) |

**语法高亮颜色**：
- `#ce9178` - 字符串
- `#b5cea8` - 数字
- `#569cd6` - 关键字
- `#dcdcaa` - 函数名
- `#6a9955` - 注释

### 内联代码样式

| 属性 | 值 |
|------|------|
| 背景色 | #f5f5f5（浅灰） |
| 文字色 | #d32f2f（红色） |
| 边框 | 1px solid #e0e0e0 |
| 圆角 | 4px |
| 内边距 | 4px 8px |
| 字体 | Monaco...（等宽） |
| 大小 | 0.9em |

---

## 💡 使用示例

### 完整的题目示例

```json
{
    "type": "单选",
    "content": "以下 C++ 代码的输出结果是什么？\n\n```cpp\n#include <iostream>\nusing namespace std;\nint main() {\n    int x = 10;\n    int y = 20;\n    cout << x + y << endl;\n    return 0;\n}\n```\n\n提示：`cout` 是标准输出流，`endl` 插入换行符。",
    "options": [
        "A. 10",
        "B. 20",
        "C. 30",
        "D. 10 20"
    ],
    "answer": "C"
}
```

### 多个代码块示例

```json
{
    "type": "单选",
    "content": "比较以下两段代码的输出区别：\n\n**代码1**：\n```cpp\ncout << 'A';\n```\n\n**代码2**：\n```cpp\ncout << 'A' + 0;\n```\n\n选择正确答案：",
    "options": [
        "A. 都输出 A",
        "B. 代码1输出A，代码2输出65",
        "C. 代码1输出65，代码2输出A",
        "D. 两者都输出 65"
    ],
    "answer": "B"
}
```

### 填空题与代码结合

```json
{
    "type": "填空",
    "content": "执行以下代码，输出结果是？\n\n```cpp\n#include <iostream>\nusing namespace std;\nint main() {\n    cout << (5 > 3) << endl;\n    return 0;\n}\n```",
    "options": [],
    "answer": "1"
}
```

---

## 🔧 JSON 转义规则

在 JSON 中编写 Markdown 时，需要注意转义：

| 字符 | JSON 转义 | 说明 |
|------|----------|------|
| 换行 | `\n` | 分隔段落或行 |
| 反斜杠 | `\\` | C++ 路径中使用 |
| 引号 | `\"` | 字符串内的引号 |
| 制表符 | `\t` | 适当缩进代码 |

**错误示例**：
```json
{
    "content": "这是\n正确的换行"  // ✅ 正确
}
```

**错误示例**：
```json
{
    "content": "这是
    错误的换行"  // ❌ 会导致 JSON 解析失败
}
```

---

## 🎯 最佳实践

### ✅ 推荐做法

1. **使用代码块代替内联代码来展示完整程序**
   ```markdown
   关键变量使用 `x` 和 `y`，完整程序如下：
   ```cpp
   ...
   ```
   ```

2. **用列表罗列关键点**
   ```markdown
   关于 cin 的说法：
   - 自动跳过空格和换行符
   - 遇到类型不匹配会失效
   ```

3. **对重要概念使用粗体**
   ```markdown
   **缓冲区**是暂存数据的内存区域
   ```

### ❌ 避免的做法

1. **不要在内联代码中写超长内容**
   ```markdown
   // ❌ 错误
   `#include <iostream>; int main() { cout << "Hello"; return 0; }`
   
   // ✅ 正确
   完整程序见下方代码块：
   ```cpp
   #include <iostream>
   ...
   ```
   ```

2. **不要混使列表和代码块**
   ```markdown
   // ❌ 混乱
   - 声明变量：`int x;`
   - 初始化：`x = 10;`
   
   // ✅ 清晰
   步骤1：声明变量
   ```cpp
   int x;
   ```
   步骤2：初始化
   ```cpp
   x = 10;
   ```
   ```

3. **不要嵌套代码块**
   ```markdown
   // ❌ 不支持
   ```
   代码中有代码块
   ```
   ```
   ```

---

## 📱 响应式设计

所有样式都支持移动设备：

- **桌面**（>768px）：代码块字体 0.95em，内padding 16px
- **平板**（768px）：字体 0.85em，padding 12px
- **手机**（<600px）：字体 0.85em，padding 10px

代码块始终支持**横向滚动**（`overflow-x: auto`），防止长代码行撑爆屏幕。

---

## 🔍 测试

已为你创建了一个演示题库：`markdown_demo.json`

包含以下示例：
- ✅ C++ 代码高亮
- ✅ Python 代码高亮
- ✅ JavaScript 代码片段
- ✅ 内联代码用法
- ✅ 列表格式
- ✅ 多行代码展示

**访问方式**：
1. 打开 http://localhost:5000/HTML/parsed_list.html
2. 找到 "Markdown + 代码高亮演示题库"
3. 开始刷题，观察代码高亮效果

---

## ⚙️ 自定义配置

### 修改代码块背景色

编辑 `quiz.css`，找到第 515 行：
```css
.question-text pre code {
    background-color: #1e1e1e;  /* 改为你喜欢的颜色 */
}
```

### 修改语法高亮主题

目前使用 **atom-one-dark** 主题。可选的主题：
- `atom-one-light` - 亮色主题
- `dracula` - Dracula 主题
- `monokai` - Monokai 主题
- 更多见：https://highlightjs.org/asset/css/

修改 `quiz.html` 第 8 行：
```html
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css">
```

### 修改内联代码颜色

编辑 `quiz.css`，找到约 545 行：
```css
.inline-code {
    color: #d32f2f;  /* 改为你喜欢的颜色 */
}
```

---

## 📚 更多信息

- **marked.js 文档**: https://marked.js.org/
- **highlight.js 文档**: https://highlightjs.org/
- **Markdown 语法**: https://daringfireball.net/projects/markdown/syntax

---

**Happy Markdown！** 🎉
