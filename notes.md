# hotel-comparer 项目备忘录

## 1. 项目概述

### 1.1 项目目的

本文档详细记录 `hotel-comparer` Tampermonkey 用户脚本的技术架构、实现细节和开发维护指南。

**项目定位**: 垂强携程酒店详情页使用体验的用户脚本，通过自动化数据提取、多酒店对比和Excel导出功能提升选房效率。

**重要提示**: 每次功能调整或携程更新前端代码后，请及时更新此备忘录。

### 1.2 核心价值

携程酒店详情页存在以下痛点：
- 需要打开多个标签页对比不同酒店信息
- 房型信息分散，难以横向对比
- 优秀房型和差评数据无法快速筛选
- 对比结果无法导出保存

本脚本通过以下方式解决上述问题：
- 一键提取当前酒店信息（评分、评论、房型等）
- 本地存储多酒店数据（最多50家）
- 批量导出Excel表格方便对比分析
- 自动计算差评率，辅助决策

---

## 2. 技术架构

### 2.1 整体架构

脚本采用**模块化对象架构**，核心由四个独立模块组成：

```
┌─────────────────────────────────────────────────────┐
│                 CONFIG 配置模块                      │
│        (存储键名、最大酒店数、7天过期)            │
└─────────────────────────────────────────────────────┘
                      │
         ┌─────────────┼─────────────┬─────────────┐
         ▼             ▼             ▼             ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   Storage    │ │  Extractor  │ │      UI     │ │ExcelExporter │
│  数据存储管理 │ │  数据提取    │ │  界面与事件  │ │  Excel 导出  │
│              │ │              │ │              │ │              │
│ localStorage  │ │ 选择器配置   │ │ 样式注入    │ │ SheetJS集成  │
│ 7天自动清理  │ │ 房型筛选    │ │ 按钮交互    │ │ 列宽设置    │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

### 2.2 核心配置

#### 2.2.1 存储配置

```javascript
const CONFIG = {
    STORAGE_KEY: 'hotelCompareData',  // localStorage 键名
    MAX_HOTELS: 50,                 // 最大存储酒店数
    EXPIRY_DAYS: 7                  // 数据过期天数
};
```

#### 2.2.2 选择器配置

```javascript
selectors: {
    // 房型相关
    mainRoomList: '[class*="mainRoomList"]',              // 完全符合要求的房型列表容器
    roomCard: '[class*="commonRoomCard"]',                // 房型卡片
    roomName: '[class*="commonRoomCard-title"]',          // 房间名称
    bedInfo: '[class*="baseRoom-bedsInfo_title"]',         // 床型信息
    facilityTitle: '[class*="baseRoom-facility_title"]',    // 设施标签文本（面积/窗户/吸烟）

    // 酒店信息
    hotelInfo: ['[class*="hotelOverview"]', '[class*="hotelInfo"]', '[class*="basicInfo"]'],

    // 评论相关
    scoreBody: ['[class*="reviewOverallScores-scoreBody"]', '[class*="reviewTop-score-ctrip"]'],
    scoreCount: ['[class*="reviewOverallScores-scoreCount"]', '[class*="reviewOverallScores-desContainer"]'],
    reviewSwitch: '[class*="reviewSwitch-review_numA"]',
    reviewTag: '[class*="reviewTag-item"]'
};
```

#### 2.2.3 数据结构

**localStorage 存储格式**:
```json
{
  "hotelId": "90100865",
  "hotelName": "云驻·诺亚江景度假酒店",
  "updateYear": "2022",
  "score": "4.8",
  "totalComments": 4550,
  "badComments": 34,
  "badCommentRate": "0.75%",
  "rooms": [
    {
      "name": "哈瓦娜甄选江景大床房",
      "area": "50平方米 | 2-5层",
      "window": "落地窗",
      "smoking": "可吸烟",
      "bedWidth": "1张特大床2米"
    }
  ],
  "url": "https://hotels.ctrip.com/hotels/detail/...",
  "extractedAt": "2026-03-05T12:00:00.000Z"
}
```

**Excel 输出列结构**:
| 列名 | 数据来源 | 处理方式 |
|------|---------|---------|
| 酒店名称 | hotelName | 原样 |
| 开业/装修 | updateYear | 原样（年份字符串） |
| 总评论 | totalComments | 整数 |
| 差评 | badComments | 整数 |
| 差评率 | badCommentRate | 计算得出，保留2位小数 |
| 评分 | score | 原样字符串 |
| 房间名称 | room.name | 原样 |
| 面积 | room.area | 原样（含楼层信息） |
| 窗户 | room.window | 包含"窗"字即记录 |
| 吸烟 | room.smoking | 包含"烟"字即记录 |
| 床型 | room.bedWidth | 原样 |
| 价格（手填） | - | 留空，供用户手动填写 |

---

## 3. 核心功能实现

### 3.1 数据提取模块（Extractor）

#### 3.1.1 7天过期清理机制

**设计**: localStorage 数据设置7天有效期，自动清理过期记录。

**实现逻辑**:
```javascript
getAll() {
    const hotels = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY));
    const now = new Date();
    const remaining = hotels.filter(h => {
        const extractedAt = new Date(h.extractedAt);
        const daysDiff = (now - extractedAt) / (1000 * 60 * 60 * 24);
        return daysDiff <= 7;
    });

    if (remaining.length < hotels.length) {
        this.save(remaining);
        console.log(`[清理] 自动删除了 ${hotels.length - remaining.length} 条超过7天的数据`);
    }

    return remaining;
}
```

#### 3.1.2 房型筛选（白名单法）

**原理**: 携程页面将房型分为三类，脚本只提取"完全符合要求"的房型。

**房型分组容器**:
- `mainRoomList` - 完全符合要求（提取）
- `compensateRoomList` - 部分符合要求（忽略）
- `notFitRoomList` - 不符合要求（忽略）

**选择器策略**:
```javascript
const mainRoomContainer = document.querySelector(this.selectors.mainRoomList);
if (!mainRoomContainer) {
    console.log('[提取] 未找到主房型列表容器，可能没有符合要求的房型');
    return [];
}

const roomCards = mainRoomContainer.querySelectorAll(this.selectors.roomCard);
```

#### 3.1.3 设施信息精确提取

**设计**: 面积和窗户信息混杂在同一组facility元素中，通过关键词区分提取。

**实现方式**: 遍历所有设施标签，通过关键词匹配：

```javascript
facilityEls.forEach(el => {
    const text = el.textContent.trim();

    // 面积 - 包含"平方米"
    if (text.includes('平方米') && !room.area) {
        room.area = text;
    }

    // 窗户 - 包含"窗"字，但不包含"平方米"（避免面积干扰）
    if (text.includes('窗') && !room.window && !text.includes('平方米')) {
        room.window = text;
    }

    // 吸烟 - 包含"烟"字
    if (text.includes('烟') && !room.smoking) {
        room.smoking = text;
    }
});
```

#### 3.1.4 千分位数字处理

**设计**: 携程评论数使用千分位逗号（如"4,550"），正则需要支持逗号。

**实现方式**: 使用正则 `([\d,]+)` 匹配数字和逗号，转换时去掉逗号。

**应用位置**:
```javascript
// 总评论数
const match = text.match(/([\d,]+)\s*条评论/);
if (match) return parseInt(match[1].replace(/,/g, ''));

// 差评数
const match = text.match(/差评\s*\(([\d,]+)\)/);
if (match) return parseInt(match[1].replace(/,/g, ''));
```

### 3.2 Excel导出模块（ExcelExporter）

#### 3.2.1 数据展开策略

**设计**: 一个酒店有多个房型，每个房型需要一行数据。酒店基本信息在每行重复。

**实现逻辑**:
```javascript
hotels.forEach(hotel => {
    const baseInfo = {
        '酒店名称': hotel.hotelName,
        '开业/装修': hotel.updateYear,
        // ... 其他通用字段
    };

    hotel.rooms.forEach(room => {
        rows.push({
            ...baseInfo,      // 重复酒店信息
            '房间名称': room.name,
            '面积': room.area,
            // ... 房型特有字段
        });
    });
});
```

#### 3.2.2 列宽配置

**列宽设置**（单位：字符数）:
```javascript
ws['!cols'] = [
    { wch: 30 },  // 酒店名称
    { wch: 10 },  // 开业/装修
    { wch: 8 },   // 总评论
    { wch: 6 },   // 差评
    { wch: 8 },   // 差评率
    { wch: 6 },   // 评分
    { wch: 25 },  // 房间名称
    { wch: 20 },  // 面积
    { wch: 8 },   // 窗户
    { wch: 8 },   // 吸烟
    { wch: 30 },  // 床型
    { wch: 12 },  // 价格（手填）
];
```

#### 3.2.3 文件命名策略

**格式**: `酒店对比_YYYYMMDD.xlsx`

```javascript
const now = new Date();
const dateStr = `${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}`;
const filename = `酒店对比_${dateStr}.xlsx`;
```

---

## 4. 关键技术要点

### 4.1 选择器模糊匹配策略

**技术**: 使用 CSS 属性选择器的模糊匹配语法 `[class*="keyword"]`

**优势**:
- 避免因携程可能更新class名导致选择器失效
- 部分匹配更加稳定
- 支持不同class前缀的变体

**示例**:
```javascript
'[class*="mainRoomList"]'      // 匹配包含 mainRoomList 的class
'[class*="commonRoomCard-title"]' // 匹配包含 commonRoomCard-title 的class
```

### 4.2 localStorage 生命周期管理

**自动清理机制**:
- 每次读取时检查过期时间
- 超过7天的记录自动删除
- 删除后立即保存清理后的数据

**设计目的**:
- 用户无需手动清理旧数据
- 避免 localStorage 空间不足
- 确保对比数据时效性

### 4.3 正则表达式设计

**千分位数字匹配**:
```javascript
/([\d,]+)\s*条评论/    // 可匹配 "4,550 条评论"
/([\d,]+)\s*条点评/    // 可匹配 "显示所有4,550条点评"
/差评\s*\(([\d,]+)\)/   // 可匹配 "差评 (34)"
```

**转换处理**:
```javascript
parseInt(match[1].replace(/,/g, ''))  // 去掉逗号后转整数
```

**应用场景**:
- 总评论数
- 差评数
- 任何可能包含千分位的数值字段

### 4.4 差评率计算

**公式**: `(差评数 / 总评论数) × 100%`

**边界处理**:
```javascript
calcBadCommentRate(total, bad) {
    if (total <= 0) return 'N/A';  // 避免除以0错误
    return ((bad / total) * 100).toFixed(2) + '%';
}
```

---

## 5. 维护指南

### 5.1 常见问题处理

| 问题 | 可能原因 | 解决方案 |
|------|----------|----------|
| 房型提取为空 | mainRoomList选择器失效 | 检查房型分组容器class是否变化 |
| 窗户信息错误 | facilityTitle选择器失效 | 验证 `baseRoom-facility_title` class是否存在 |
| 总评论数为0 | 千分位逗号处理失效 | 检查正则 `/([\d,]+)/` 是否正确应用 |
| 评分未提取 | scoreBody选择器失效 | 检查评分元素选择器备选列表 |
| Excel无法下载 | XLSX库加载失败 | 检查CDN链接是否可访问 |

### 5.2 选择器失效检测

**失效表现**:
- 点击"提取当前酒店"后提示"无法提取酒店名称"
- 控制台输出大量 `null` 或 `undefined`
- 房型列表为空

**排查步骤**:
1. 打开携程酒店详情页
2. 打开浏览器控制台
3. 执行以下命令验证选择器：
   ```javascript
   document.querySelector('[class*="mainRoomList"]')
   document.querySelector('[class*="commonRoomCard-title"]')
   document.querySelector('[class*="baseRoom-bedsInfo_title"]')
   document.querySelector('[class*="baseRoom-facility_title"]')
   ```
4. 如返回 `null`，使用开发者工具检查新class名
5. 确认选择器对象中的选择器配置

### 5.3 携程前端更新应对

**检测方法**:
1. 用户反馈功能失效
2. 控制台无报错但数据提取失败
3. 选择器查询返回 `null`

**处理流程**:
1. 打开携程酒店详情页
2. 使用开发者工具检查目标元素结构
3. 确认选择器对象中的失效选择器
4. 本地测试验证功能恢复
5. 设置版本号：设置 `@version` 字段
6. 发布到 Greasy Fork 或其他脚本托管平台

### 5.4 数据迁移指南

**场景**: 用户版本兼容，需要保留历史数据。

**兼容性**:
- 存储键名不变（`hotelCompareData`）
- 数据结构向后兼容
- 新增字段（如 `smoking`）默认为空字符串

**无需处理**: 旧数据自动兼容，新数据包含新字段。

---

## 6. 开发规范

### 6.1 代码风格

- 使用 ES6+ 语法（箭头函数、模板字符串、解构赋值）
- 对象采用字面量语法
- 常量集中管理在 `CONFIG` 对象
- 错误处理使用 `try-catch` 包裹关键逻辑
- 控制台日志添加前缀便于调试（如 `[提取]`、`[清理]`）

### 6.2 扩展新功能

遵循现有模块化模式：

```javascript
// 1. 在 Extractor 中添加字段提取方法
const Extractor = {
    // ... existing methods

    getNewField() {
        const el = document.querySelector(this.selectors.newField);
        return el ? el.textContent.trim() : '';
    }
};

// 2. 在 extractHotelData 中调用新方法
extractHotelData() {
    return {
        // ... existing fields
        newField: this.getNewField()
    };
}

// 3. 配置 ExcelExporter 导出列
const ExcelExporter = {
    export(hotels) {
        rows.push({
            ...baseInfo,
            // ... existing room fields
            '新字段': room.newField || ''
        });
    }
};
```

### 6.3 函数设计原则

**单一职责**: 每个函数/方法只负责一个明确的任务。

**命名规范**:
- 数据提取: `getXxx()` - 如 `getHotelName()`, `getTotalComments()`
- 数据处理: `calcXxx()` - 如 `calcBadCommentRate()`
- UI操作: `handleXxx()` - 如 `handleExtract()`, `handleExport()`
- 工具方法: 动词开头 - 如 `getAll()`, `add()`, `save()`

**示例**:
```javascript
// 提取函数 - 单一职责
getScore() {
    const el = document.querySelector(this.selectors.scoreBody);
    if (el) {
        const match = el.textContent.trim().match(/(\d+\.\d+)/);
        return match ? match[1] : '';
    }
    return '';
}

// 处理函数 - 单一职责
calcBadCommentRate(total, bad) {
    if (total <= 0) return 'N/A';
    return ((bad / total) * 100).toFixed(2) + '%';
}
```

### 6.4 版本发布流程

1. **代码完成**: 完成功能开发
2. **本地测试**: 在Tampermonkey调试模式下验证所有功能
3. **版本号发布**: 设置 `@version` 字段（如 `1.0.11`）
4. **文档同步**: 记录变更到 `notes.md`
5. **发布**: 上传到Greasy Fork或GitHub，更新说明文档

### 6.5 依赖管理

**外部依赖**:
- `SheetJS (XLSX)`: Excel文件生成
  - CDN: `https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js`
  - 用途: `XLSX.utils.book_new()`, `XLSX.utils.json_to_sheet()`, `XLSX.writeFile()`

**注意事项**:
- CDN链接变更时需同步设置 `@require` 字段
- 版本升级可能需要适配API变化
