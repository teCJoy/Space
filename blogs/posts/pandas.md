## 示例表格（全文唯一示例）
```python
import pandas as pd

df = pd.DataFrame({
    '姓名': ['张三', '李四', '王五', '赵六'],
    '年龄': [17, 18, 16, 17],
    '成绩': [88, 95, 70, 83],
    '班级': ['A', 'B', 'A', 'B']
})
```
|    | 姓名 | 年龄 | 成绩 | 班级 |
|---:|-----|------|-----|------|
| 0 | 张三 | 17 | 88 | A |
| 1 | 李四 | 18 | 95 | B |
| 2 | 王五 | 16 | 70 | A |
| 3 | 赵六 | 17 | 83 | B |

---

## 1. 创建 DataFrame 与导入导出
```python
# 1.1 字典创建
data = {'姓名':['张三','李四','王五','赵六'],
        '年龄':[17,18,16,17],
        '成绩':[88,95,70,83],
        '班级':['A','B','A','B']}
df = pd.DataFrame(data, columns=['姓名','年龄','成绩','班级'])

# 1.2 从文件导入
df = pd.read_csv('data.csv')
df = pd.read_excel('data.xlsx')

# 1.3 导出
df.to_csv('out.csv', index=False)
df.to_excel('out.xlsx', index=False)
```

---

## 2. 基本查看（属性与方法）
```python
df.head(2)         # 前2行 → 张三、李四
df.tail(2)         # 后2行 → 王五、赵六
df.shape           # (4, 4)
df.info()          # 各列类型、非空值
df.describe()      # 数值列统计（年龄、成绩）
df.columns         # Index(['姓名', '年龄', '成绩', '班级'])
df.index           # RangeIndex(start=0, stop=4, step=1)
df.dtypes          # 每列数据类型
df.values          # 转为 numpy 数组
df.T               # 转置
```

---

## 3. 统计类函数（count / sum / mean / max / min）
> 教材强调 `axis=0`（纵向，默认）与 `axis=1`（横向），以及 `count()` 不计 NaN。

### 3.1 原生表上的统计
```python
df.sum(numeric_only=True)     # 年龄68  成绩336
df.mean(numeric_only=True)    # 年龄17  成绩84
df.max(numeric_only=True)     # 年龄18  成绩95
df.min(numeric_only=True)     # 年龄16  成绩70
```

### 3.2 横向操作（axis=1）
```python
# 每个人的年龄与成绩的平均值
df[['年龄','成绩']].mean(axis=1)
# 0    52.5
# 1    56.5
# 2    43.0
# 3    50.0
```

### 3.3 含缺失值时的 count()
制造缺失值版本 `df_miss`：
```python
df_miss = df.copy()
df_miss.loc[1, '成绩'] = None    # 李四成绩变 NaN
df_miss.loc[3, '年龄'] = None    # 赵六年龄变 NaN
```
|    | 姓名 | 年龄 | 成绩 | 班级 |
|---:|-----|------|------|------|
| 0 | 张三 | 17.0 | 88.0 | A |
| 1 | 李四 | 18.0 | NaN  | B |
| 2 | 王五 | 16.0 | 70.0 | A |
| 3 | 赵六 | NaN  | 83.0 | B |

```python
df_miss.count()   # 姓名4、年龄3、成绩3、班级4
df_miss['成绩'].sum()  # 241.0（跳过 NaN）
```

---

## 4. 数据选择（**核心：标签 vs 位置**）

### 4.1 选择列
| 写法 | 示例 | 说明 |
|------|------|------|
| `df['列名']` | `df['姓名']` | ✅ 通用推荐 |
| `df.列名` | `df.姓名` | ⚠️ 列名不能有空格，易与已有方法重名 |
| `df[['列1','列2']]` | `df[['姓名','成绩']]` | 选多列，双层括号 |
| `df.iloc[:, 位置]` | `df.iloc[:, 0]` | 按位置取列，等价于 `df['姓名']` |
| `df.loc[:, '列名']` | `df.loc[:, '姓名']` | 显式所有行的某列 |

**不要**用 `df.columns[0]` 取列数据，它返回的只是列名 `'姓名'`。正确按位置取列请用 `df.iloc[:, 位置]`。

### 4.2 选择行（辨析最密集的区域）
| 写法 | 基于 | 本例结果 | 规则 |
|------|------|----------|------|
| `df[0:2]` | 行位置 | 张三、李四 | 左闭右开 |
| `df.loc[0:2]` | 标签 | 张三、李四、王五 | **包含末端标签** |
| `df.iloc[0:2]` | 位置 | 张三、李四 | 左闭右开 |
| `df.loc[0]` | 标签 | 张三（Series） | 单行 |
| `df.iloc[0]` | 位置 | 张三（Series） | 单行 |
| `df[df['成绩']>85]` | 布尔 | 张三、李四 | 条件筛选 |

**记忆**：`iloc` → **i**nteger location，遵循 Python 切片规则；`loc` → 标签切片，闭区间。

### 4.3 同时选择行和列
```python
df.loc[[0,2], ['姓名','成绩']]   # 标签定位
df.iloc[[0,2], [0,2]]           # 位置定位
```

### 4.4 单个值的提取与修改
```python
# 推荐：at（标签）/ iat（位置）
df.at[1, '成绩']    # 95
df.iat[1, 2]        # 95

# 修改
df.at[0, '成绩'] = 90
df.iat[0, 2] = 92

# 不推荐的链式：df['成绩'][0]（可能无效且警告）
```

---

## 5. 修改与赋值
```python
# 新增列
df['总分'] = df['成绩']   # 模仿教材添加总分列

# 修改整列
df['成绩'] = df['成绩'] + 5

# 插入列（在指定位置）
df.insert(1, '学号', ['001','002','003','004'])

# 删除行/列
df.drop(0)                       # 删除标签为0的行
df.drop('年龄', axis=1)          # 删除年龄列
df.drop(columns=['年龄','总分'])  # 也可直接写 columns

# 重命名
df.rename(columns={'成绩':'技术分'})
df.rename(index={0:'学生A'})
df.columns = ['A','B','C','D']    # 整体替换列名
```

---

## 6. 条件筛选（三种风格）
```python
# 6.1 布尔索引
df[df['成绩'] >= 85]
df[(df['班级']=='A') & (df['年龄']>16)]

# 6.2 .query() 字符串条件
df.query('成绩 >= 85')
df.query("班级 == 'A' and 年龄 > 16")

# 6.3 .where() / .mask() 保持形状
df.where(df['成绩'] > 80)    # 成绩≤80 变 NaN
df.mask(df['成绩'] > 80)     # 成绩>80 变 NaN
```

---

## 7. 缺失值处理
```python
df.isnull()         # 布尔表
df.dropna()         # 删除含空值的行
df.fillna(0)        # 空值填0
df['成绩'].fillna(df['成绩'].mean())  # 用均值填充
```

---

## 8. 重复值处理
```python
df.duplicated()                  # 判断各行是否重复
df.drop_duplicates()             # 删除重复行
df.drop_duplicates(subset='班级') # 按班级去重，保留第一个
```

---

## 9. 排序 sort_values()
> 教材重点：`ascending` 控制升降序，支持多列排序。

```python
# 按总分降序
df.sort_values('总分', ascending=False)

# 按年龄升序（默认 ascending=True）
df.sort_values('年龄')

# 多列排序：先班级升序，再总分降序
df.sort_values(['班级', '总分'], ascending=[True, False])
```

---

## 10. 分组聚合 groupby()
> 教材重点：`as_index` 参数，分组后对子集使用统计函数。

```python
# 基本分组求均值
df.groupby('班级')['成绩'].mean()
# A    79.0
# B    89.0

# 多种聚合
df.groupby('班级').agg({'成绩':['mean','max','min'], '年龄':'max'})

# as_index=False：结果不把分组键当索引，保留普通列
df.groupby('班级', as_index=False)['成绩'].mean()
#   班级   成绩
# 0  A  79.0
# 1  B  89.0

# 先创建分组对象，再取一列统计
gf = df.groupby('班级')
gf['成绩'].max()   # A:88  B:95
```

---

## 11. 数据合并
```python
# 构造新表
df2 = pd.DataFrame({'姓名':['张三','李四'], '出勤率':[0.95,0.88]})

# 横向合并（类似 JOIN）
pd.merge(df, df2, on='姓名', how='left')

# 纵向拼接（替代已弃用的 append）
new_row = pd.DataFrame({'姓名':['孙七'],'年龄':[17],'成绩':[80],'班级':['A']})
pd.concat([df, new_row], ignore_index=True)  # ignore_index 重新编号
```

---

## 12. 函数应用（apply / map / applymap）
```python
# Series 每个值应用函数
df['成绩'].apply(lambda x: '优秀' if x>=90 else '一般')

# 映射替换
df['班级'].map({'A':'文科班', 'B':'理科班'})

# DataFrame 每个元素应用函数
df[['年龄','成绩']].applymap(lambda x: x+1)
```

---

## 13. 字符串操作（.str 访问器）
```python
df['姓名'].str.len()              # 姓名长度
df['姓名'].str.contains('张')     # 是否包含“张”
df['姓名'].str.replace('张','章') # 替换
```

---

## 14. 数据类型转换
```python
df['年龄'] = df['年龄'].astype(float)
pd.to_numeric(df['成绩'], errors='coerce')  # 强转数值
```

---

## 15. 索引操作
```python
df2 = df.set_index('姓名')   # 设置姓名列为索引
df2.reset_index()            # 恢复默认索引
```

---

## 16. 绘图（需 matplotlib）
```python
import matplotlib.pyplot as plt
df['成绩'].plot(kind='bar')
plt.show()
```

---

## 17. 教材全部函数速查表（统一到学生表）
| 教材函数 | 示例 | 说明 |
|----------|------|------|
| `count()` | `df.count()` / `df_miss.count()` | 非空计数，默认按列 |
| `sum()` | `df['成绩'].sum()` | 求和，可设 `axis=0/1` |
| `mean()` | `df[['年龄','成绩']].mean(axis=1)` | 平均值，横向为每人平均 |
| `max()` / `min()` | `df['年龄'].max()` | 最大/最小值 |
| `head(n)` | `df.head(2)` | 前 n 行 |
| `tail(n)` | `df.tail(2)` | 后 n 行 |
| `groupby()` | `df.groupby('班级')['成绩'].mean()` | 分组聚合，注意 `as_index` |
| `sort_values()` | `df.sort_values('总分', ascending=False)` | 排序，可多列 |
| `drop()` | `df.drop(['年龄'], axis=1)` | 删除行列，不修改原对象 |
| `rename()` | `df.rename(columns={'成绩':'技术'})` | 重命名列/索引 |
| `concat()` | `pd.concat([df1, df2], ignore_index=True)` | 拼接（取代 `append`） |
| `insert()` | `df.insert(1, '新列', 值列表)` | 插入列，会修改原对象 |
| `describe()` | `df.describe()` | 各列基本统计 |
| `value_counts()` | `df['班级'].value_counts()` | 频数统计 |
| `apply()` | `df['成绩'].apply(lambda x: ...)` | 对每个元素应用函数 |

---

## 终极对比：同一操作的不同写法
| 想做的事 | 推荐写法 | 替代/注意 |
|----------|----------|-----------|
| 取一列 | `df['姓名']` | `df.姓名`（不推荐） |
| 取多列 | `df[['姓名','成绩']]` | `df.iloc[:, [0,2]]` |
| 按标签切行（含末端） | `df.loc[0:2]` | — |
| 按位置切行（不含末端） | `df.iloc[0:2]` | `df[0:2]` |
| 条件筛选 | `df.query('成绩>85')` | `df[df['成绩']>85]` |
| 取单值 | `df.at[0,'成绩']` | `df.iat[0,2]` |
| 改单值 | `df.at[0,'成绩']=90` | 禁止 `df['成绩'][0]=90` |
| 删除列 | `df.drop('年龄', axis=1)` | `del df['年龄']` |
| 分组求均值 | `df.groupby('班级')['成绩'].mean()` | `df.groupby('班级').agg('mean')` |
| 纵向合并 | `pd.concat([df1, df2], ignore_index=True)` | 废弃的 `df1.append(df2)` |

**这份资料把所有教材知识点、所有“重复”语法全部拉通在同一张学生表上，你复习时只需要盯着这张表，就能还原出整个 pandas 基本操作体系。**
