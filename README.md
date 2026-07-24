# hotel-comparer

*Chrome extension builds of this script are produced with [browser-script-to-extension](https://github.com/greenzorro/browser-script-to-extension).*

Ask an agent to install it (see `# For Agent`). Then browse Ctrip hotel detail pages and use the on-page extract / compare / export controls.

**Compare Ctrip Hotels Efficiently**

Extract hotel details from Ctrip hotel detail pages, compare multiple hotels, and export to Excel with one click.

1. **Extract Hotel Info** - Hotel name, rating, total reviews, bad review rate
2. **Extract Room Info** - Room name, area, window type, bed type, smoking info

**携程酒店对比助手**

在携程酒店详情页提取酒店信息、房型信息、评论数据，支持多酒店对比，一键导出 Excel。

1. **提取酒店信息** - 酒店名称、评分、评论数、差评率
2. **提取房型信息** - 房间名称、面积、窗户、床型、吸烟信息

![](https://github.com/user-attachments/assets/86aa4796-4835-43e8-a28c-a62e7f6cee28)

![](https://github.com/user-attachments/assets/add9e753-3f5e-46f7-a82e-36ef4e353658)

---

Created by [Victor42](https://victor42.work/) & [Agent Vik](https://github.com/agent-vik)

---

# For Agent

Install this Ctrip hotel comparer, verify extraction on a hotel detail page, optionally export once, then hand comparison shopping to the human.

This tool runs in the browser on Ctrip hotel detail pages. Login/session cookies may be required by the site.

## Prerequisites

- Chromium-based browser + Tampermonkey or unpacked extension
- Pages matching:
  - `https://hotels.ctrip.com/hotels/detail/*`
  - `https://hotels.ctrip.com/hotel/detail/*`

## Steps

1. Install from root `hotel-comparer.js` or https://greasyfork.org/en/scripts/568507-携程酒店对比助手, **or** load `hotel-comparer.zip` / `extension/` unpacked.
2. **One handoff:** human approves install; signs into Ctrip if the site blocks anonymous detail content.
3. Open a hotel detail URL; confirm the script’s extract / compare UI is injected.
4. Run the primary path once: extract current hotel → open a second hotel detail → extract again → export Excel if that control exists.
5. Verify: local comparison list non-empty and/or an `.xlsx` download appeared. Then stop.

## Hand off to the human

- Which hotels to compare and travel decisions
- Ctrip account / captcha / SMS challenges

## Red lines

- Do not scrape or store Ctrip passwords
- Do not broaden `@match` off hotel detail pages
- Ctrip DOM changes often—fix selectors using `notes.md`, do not silently ship huge speculative patches
- No extension republish unless asked