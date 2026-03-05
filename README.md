# 携程酒店对比助手

提取携程酒店详情页信息，支持多酒店对比，一键导出 Excel。

## 功能

- 提取酒店信息：名称、开业/装修年份、评分、评论数、差评率
- 提取房型信息：房间名称、面积、窗户、床型
- 只提取完全符合筛选条件的房型
- 多酒店数据收集，一键导出 Excel

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 下载 `hotel-compare.user.js` 文件
3. 拖拽到浏览器窗口，Tampermonkey 会自动安装

## 使用

1. 打开携程酒店详情页
2. 页面右上角出现"酒店对比助手"面板
3. 点击「提取当前酒店」保存数据
4. 浏览其他酒店，重复提取
5. 点击「导出 Excel」下载对比表格

## 导出格式

| 酒店名称 | 开业/装修 | 总评论 | 差评 | 差评率 | 评分 | 房间名称 | 面积 | 窗户 | 床型 |

- 一个酒店多个房间时，每个房间一行

## 注意

- 仅支持携程酒店详情页
- 手机端不支持
- 数据存在浏览器 localStorage，清除浏览器数据会丢失
- 建议及时导出 Excel 备份

## 许可证

MIT License

![](https://github.com/user-attachments/assets/86aa4796-4835-43e8-a28c-a62e7f6cee28)

![](https://github.com/user-attachments/assets/add9e753-3f5e-46f7-a82e-36ef4e353658)
