/*
 * File: hotel-comparer.js
 * Project: browser-scipts
 * Created: 2026-03-05 08:06:45
 * Author: Victor Cheng
 * Email: hi@victor42.work
 * Description: Extract Ctrip hotel details, compare multiple hotels, export to Excel
 */



(function() {
    'use strict';

    // ========================================
    // 配置
    // ========================================
    const CONFIG = {
        STORAGE_KEY: 'hotelCompareData',
        MAX_HOTELS: 50
    };

    // ========================================
    // 数据存储模块
    // ========================================
    const Storage = {
        getAll() {
            try {
                const data = localStorage.getItem(CONFIG.STORAGE_KEY);
                if (!data) return [];

                const hotels = JSON.parse(data);
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
            } catch (e) {
                console.error('读取存储数据失败:', e);
                return [];
            }
        },

        save(data) {
            try {
                localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(data));
                return true;
            } catch (e) {
                console.error('保存数据失败:', e);
                return false;
            }
        },

        add(hotelData) {
            const data = this.getAll();
            const existingIndex = data.findIndex(h => h.hotelId === hotelData.hotelId);

            if (existingIndex >= 0) {
                data[existingIndex] = hotelData;
            } else {
                if (data.length >= CONFIG.MAX_HOTELS) {
                    data.shift();
                }
                data.push(hotelData);
            }

            return this.save(data);
        },

        remove(hotelId) {
            const data = this.getAll().filter(h => h.hotelId !== hotelId);
            return this.save(data);
        },

        clear() {
            localStorage.removeItem(CONFIG.STORAGE_KEY);
        },

        count() {
            return this.getAll().length;
        }
    };

    // ========================================
    // 数据提取模块
    // ========================================
    const Extractor = {
        // 选择器配置
        selectors: {
            // 房型相关
            mainRoomList: '[class*="mainRoomList"]',
            roomCard: '[class*="commonRoomCard"]',
            roomName: '[class*="commonRoomCard-title"]',
            bedInfo: '[class*="baseRoom-bedsInfo_title"]',
            facilityTitle: '[class*="baseRoom-facility_title"]',
            // 酒店信息
            hotelInfo: ['[class*="hotelOverview"]', '[class*="hotelInfo"]', '[class*="basicInfo"]'],
            // 评论相关
            scoreBody: ['[class*="reviewOverallScores-scoreBody"]', '[class*="reviewTop-score-ctrip"]'],
            scoreCount: ['[class*="reviewOverallScores-scoreCount"]', '[class*="reviewOverallScores-desContainer"]'],
            reviewSwitch: '[class*="reviewSwitch-review_numA"]',
            reviewTag: '[class*="reviewTag-item"]'
        },

        /**
         * 从 URL 获取酒店 ID
         */
        getHotelId() {
            const url = new URL(window.location.href);
            const params = new URLSearchParams(url.search);
            return params.get('hotelId') || '';
        },

        /**
         * 提取酒店名称
         */
        getHotelName() {
            const title = document.title;
            const match = title.match(/(.+?)预订价格/);
            return match ? match[1].trim() : '';
        },

        /**
         * 提取开业/装修时间（取最新的）
         */
        getUpdateYear() {
            for (const sel of this.selectors.hotelInfo) {
                const container = document.querySelector(sel);
                if (container) {
                    const text = container.innerText;
                    const openMatch = text.match(/开业[：:]\s*(\d{4})/);
                    const decoMatch = text.match(/装修[：:]\s*(\d{4})/);
                    
                    const openYear = openMatch ? parseInt(openMatch[1]) : 0;
                    const decoYear = decoMatch ? parseInt(decoMatch[1]) : 0;
                    
                    const maxYear = Math.max(openYear, decoYear);
                    if (maxYear > 0) return maxYear.toString();
                }
            }
            return '';
        },

        /**
         * 提取评分
         */
        getScore() {
            for (const sel of this.selectors.scoreBody) {
                const el = document.querySelector(sel);
                if (el) {
                    const text = el.textContent.trim();
                    const match = text.match(/(\d+\.\d+)/);
                    if (match) return match[1];
                }
            }
            return '';
        },

        /**
         * 提取总评论数
         */
        getTotalComments() {
            for (const sel of this.selectors.scoreCount) {
                const el = document.querySelector(sel);
                if (el) {
                    const text = el.textContent.trim();
                    const match = text.match(/([\d,]+)\s*条评论/);
                    if (match) return parseInt(match[1].replace(/,/g, ''));
                }
            }

            const linkEl = document.querySelector(this.selectors.reviewSwitch);
            if (linkEl) {
                const text = linkEl.textContent.trim();
                const match = text.match(/显示所有([\d,]+)条点评/);
                if (match) return parseInt(match[1].replace(/,/g, ''));
            }

            const tagEls = document.querySelectorAll(this.selectors.reviewTag);
            for (const el of tagEls) {
                const text = el.textContent.trim();
                if (text.includes('所有点评')) {
                    const match = text.match(/所有点评\s*\(([\d,]+)\)/);
                    if (match) return parseInt(match[1].replace(/,/g, ''));
                }
            }

            return 0;
        },

        /**
         * 提取差评数
         */
        getBadComments() {
            const tagEls = document.querySelectorAll(this.selectors.reviewTag);
            for (const el of tagEls) {
                const text = el.textContent.trim();
                if (text.includes('差评')) {
                    const match = text.match(/差评\s*\(([\d,]+)\)/);
                    if (match) return parseInt(match[1].replace(/,/g, ''));
                }
            }
            return 0;
        },

        /**
         * 计算差评率
         */
        calcBadCommentRate(total, bad) {
            if (total <= 0) return 'N/A';
            return ((bad / total) * 100).toFixed(2) + '%';
        },

        /**
         * 白名单方式：直接定位"完全符合要求"的房型列表容器
         */
        getRooms() {
            console.log('[提取] 开始查找完全符合要求的房型列表...');
            
            const mainRoomContainer = document.querySelector(this.selectors.mainRoomList);
            
            if (!mainRoomContainer) {
                console.log('[提取] 未找到主房型列表容器，可能没有符合要求的房型');
                return [];
            }
            
            const roomCards = mainRoomContainer.querySelectorAll(this.selectors.roomCard);
            console.log('[提取] 主房型列表容器内找到', roomCards.length, '个房型卡片');
            
            const rooms = [];
            roomCards.forEach(card => {
                const room = this.extractRoomFromCard(card);
                if (room.name) {
                    rooms.push(room);
                    console.log('[提取] 房型:', room.name);
                }
            });
            
            console.log('[提取] 最终提取', rooms.length, '个完全符合要求的房型');
            return rooms;
        },

        /**
         * 从房型卡片提取信息
         */
        extractRoomFromCard(card) {
            const room = {
                name: '',
                area: '',
                window: '',
                bedWidth: '',
                smoking: ''
            };

            const nameEl = card.querySelector(this.selectors.roomName);
            if (nameEl) {
                room.name = nameEl.textContent.trim();
            }

            const bedEl = card.querySelector(this.selectors.bedInfo);
            if (bedEl) {
                room.bedWidth = bedEl.textContent.trim();
            }

            const facilityEls = card.querySelectorAll(this.selectors.facilityTitle);

            facilityEls.forEach(el => {
                const text = el.textContent.trim();

                if (text.includes('平方米') && !room.area) {
                    room.area = text;
                }

                if (text.includes('窗') && !room.window && !text.includes('平方米')) {
                    room.window = text;
                }

                if (text.includes('烟') && !room.smoking) {
                    room.smoking = text;
                }
            });

            return room;
        },

        /**
         * 提取完整酒店数据
         */
        extractHotelData() {
            const totalComments = this.getTotalComments();
            const badComments = this.getBadComments();

            return {
                hotelId: this.getHotelId(),
                hotelName: this.getHotelName(),
                updateYear: this.getUpdateYear(),
                score: this.getScore(),
                totalComments: totalComments,
                badComments: badComments,
                badCommentRate: this.calcBadCommentRate(totalComments, badComments),
                rooms: this.getRooms(),
                url: window.location.href,
                extractedAt: new Date().toISOString()
            };
        }
    };

    // ========================================
    // UI 模块
    // ========================================
    const UI = {
        createStyles() {
            const style = document.createElement('style');
            style.textContent = `
                #hotel-compare-container {
                    position: fixed;
                    top: 80px;
                    right: 0;
                    z-index: 99999;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                }

                #hotel-compare-panel {
                    background: #fff;
                    border-radius: 12px 0 0 12px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                    padding: 16px;
                    width: 200px;
                    border: 1px solid #e5e5e5;
                    border-right: none;
                    transition: width 0.3s;
                }

                #hotel-compare-panel.collapsed {
                    padding: 8px 16px;
                    width: 60px;
                }

                #hotel-compare-panel.collapsed .panel-content {
                    display: none;
                }

                #hotel-compare-panel.collapsed .panel-title-text {
                    display: none;
                }

                #hotel-compare-panel .panel-title {
                    font-size: 16px;
                    font-weight: 600;
                    color: #333;
                    margin-bottom: 12px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    cursor: pointer;
                    user-select: none;
                }

                #hotel-compare-panel.collapsed .panel-title {
                    margin-bottom: 0;
                }

                #hotel-compare-panel .toggle-icon {
                    font-size: 12px;
                    transition: transform 0.3s;
                    color: #999;
                }

                #hotel-compare-panel.collapsed .toggle-icon {
                    transform: rotate(-90deg);
                }

                .hotel-compare-btn {
                    display: block;
                    width: 100%;
                    padding: 10px 16px;
                    margin-bottom: 8px;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 13px;
                    font-weight: 500;
                    transition: all 0.2s;
                    white-space: normal;
                    line-height: 1.4;
                }

                .hotel-compare-btn:last-child {
                    margin-bottom: 0;
                }

                .hotel-compare-btn-primary {
                    background: #667eea;
                    color: white;
                }

                .hotel-compare-btn-primary:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
                }

                .hotel-compare-btn-success {
                    background: #11998e;
                    color: white;
                }

                .hotel-compare-btn-success:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(17, 153, 142, 0.4);
                }

                .hotel-compare-btn-danger {
                    background: #f5f5f5;
                    color: #666;
                }

                .hotel-compare-btn-danger:hover {
                    background: #e5e5e5;
                }

                .hotel-compare-count {
                    display: inline-block;
                    background: rgba(255,255,255,0.3);
                    padding: 2px 8px;
                    border-radius: 10px;
                    margin-left: 4px;
                    font-size: 12px;
                }

                .hotel-compare-status {
                    font-size: 12px;
                    color: #666;
                    text-align: center;
                    padding: 8px;
                    background: #f9f9f9;
                    border-radius: 6px;
                    margin-top: 8px;
                }

                .hotel-compare-status.success {
                    background: #e8f5e9;
                    color: #2e7d32;
                }

                .hotel-compare-status.error {
                    background: #ffebee;
                    color: #c62828;
                }

                .hotel-list {
                    max-height: 200px;
                    overflow-y: auto;
                    margin-top: 8px;
                    border-top: 1px solid #eee;
                    padding-top: 8px;
                }

                .hotel-list-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 6px 0;
                    font-size: 12px;
                    border-bottom: 1px solid #f5f5f5;
                }

                .hotel-list-item:last-child {
                    border-bottom: none;
                }

                .hotel-list-item .name {
                    color: #333;
                    flex: 1;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .hotel-list-item .remove {
                    color: #999;
                    cursor: pointer;
                    padding: 0 4px;
                }

                .hotel-list-item .remove:hover {
                    color: #f44336;
                }
            `;
            document.head.appendChild(style);
        },

        createPanel() {
            const container = document.createElement('div');
            container.id = 'hotel-compare-container';

            const count = Storage.count();

            container.innerHTML = `
                <div id="hotel-compare-panel">
                    <div class="panel-title" id="btn-toggle">
                        🏨 <span class="panel-title-text">酒店对比助手</span>
                        <span class="toggle-icon">▼</span>
                    </div>

                    <div class="panel-content">
                        <button class="hotel-compare-btn hotel-compare-btn-primary" id="btn-extract">
                            提取当前酒店
                        </button>

                        <button class="hotel-compare-btn hotel-compare-btn-success" id="btn-export">
                            导出 Excel<span class="hotel-compare-count">${count}</span>
                        </button>

                        <button class="hotel-compare-btn hotel-compare-btn-danger" id="btn-clear">
                            清空数据
                        </button>

                        <div class="hotel-compare-status" id="compare-status" style="display: none;"></div>

                        <div class="hotel-list" id="hotel-list" style="display: none;"></div>
                    </div>
                </div>
            `;

            document.body.appendChild(container);
            this.bindEvents();
            this.updateHotelList();
        },

        bindEvents() {
            const panel = document.getElementById('hotel-compare-panel');

            document.getElementById('btn-toggle').addEventListener('click', () => {
                panel.classList.toggle('collapsed');
            });

            document.getElementById('btn-extract').addEventListener('click', () => {
                this.handleExtract();
            });

            document.getElementById('btn-export').addEventListener('click', () => {
                this.handleExport();
            });

            document.getElementById('btn-clear').addEventListener('click', () => {
                this.handleClear();
            });
        },

        updateHotelList() {
            const hotels = Storage.getAll();
            const countEl = document.querySelector('.hotel-compare-count');
            const listEl = document.getElementById('hotel-list');

            if (countEl) {
                countEl.textContent = hotels.length;
            }

            if (listEl) {
                if (hotels.length > 0) {
                    listEl.style.display = 'block';
                    listEl.innerHTML = hotels.map(h => `
                        <div class="hotel-list-item">
                            <span class="name" title="${h.hotelName}">${h.hotelName}</span>
                            <span class="remove" data-id="${h.hotelId}">×</span>
                        </div>
                    `).join('');

                    listEl.querySelectorAll('.remove').forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            const id = e.target.getAttribute('data-id');
                            Storage.remove(id);
                            this.updateHotelList();
                            this.showStatus('已删除', 'success');
                        });
                    });
                } else {
                    listEl.style.display = 'none';
                }
            }
        },

        showStatus(message, type = '') {
            const statusEl = document.getElementById('compare-status');
            if (statusEl) {
                statusEl.textContent = message;
                statusEl.className = 'hotel-compare-status ' + type;
                statusEl.style.display = 'block';

                setTimeout(() => {
                    statusEl.style.display = 'none';
                }, 3000);
            }
        },

            handleExtract() {
                try {
                    const data = Extractor.extractHotelData();

                    if (!data.hotelName) {
                        this.showStatus('无法提取酒店名称', 'error');
                        return;
                    }

                    if (Storage.add(data)) {
                        this.showStatus(`已添加: ${data.hotelName} (${data.rooms.length}房型)`, 'success');
                        this.updateHotelList();
                    } else {
                        this.showStatus('保存失败', 'error');
                    }
                } catch (e) {
                    console.error('提取失败:', e);
                    this.showStatus('提取失败: ' + e.message, 'error');
                }
            },

        handleExport() {
            const hotels = Storage.getAll();

            if (hotels.length === 0) {
                this.showStatus('没有数据可导出', 'error');
                return;
            }

            try {
                ExcelExporter.export(hotels);
                this.showStatus(`已导出 ${hotels.length} 家酒店`, 'success');
            } catch (e) {
                console.error('导出失败:', e);
                this.showStatus('导出失败: ' + e.message, 'error');
            }
        },

        handleClear() {
            if (confirm('确定要清空所有已收集的酒店数据吗？')) {
                Storage.clear();
                this.updateHotelList();
                this.showStatus('已清空所有数据', 'success');
            }
        },

        init() {
            this.createStyles();
            this.createPanel();
        }
    };

    // ========================================
    // Excel 导出模块
    // ========================================
    const ExcelExporter = {
        export(hotels) {
            const rows = [];

            hotels.forEach(hotel => {
                const baseInfo = {
                    '酒店名称': hotel.hotelName,
                    '开业/装修': hotel.updateYear || '',
                    '总评论': hotel.totalComments || '',
                    '差评': hotel.badComments || '',
                    '差评率': hotel.badCommentRate,
                    '评分': hotel.score || '',
                };

                if (hotel.rooms && hotel.rooms.length > 0) {
                    hotel.rooms.forEach((room) => {
                        rows.push({
                            ...baseInfo,
                            '房间名称': room.name || '',
                            '面积': room.area || '',
                            '窗户': room.window || '',
                            '吸烟': room.smoking || '',
                            '床型': room.bedWidth || '',
                            '价格（手填）': ''
                        });
                    });
                } else {
                    rows.push({
                        ...baseInfo,
                        '房间名称': '',
                        '面积': '',
                        '窗户': '',
                        '吸烟': '',
                        '床型': '',
                        '价格（手填）': ''
                    });
                }
            });

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(rows);

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

            XLSX.utils.book_append_sheet(wb, ws, '酒店对比');

            const now = new Date();
            const dateStr = `${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}`;
            const filename = `酒店对比_${dateStr}.xlsx`;

            XLSX.writeFile(wb, filename);
        }
    };

    // ========================================
    // 初始化
    // ========================================
    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(() => UI.init(), 1000);
            });
        } else {
            setTimeout(() => UI.init(), 1000);
        }
    }

    init();

})();