# Fixed A01–J05 persona baseline

This file is the frozen persona baseline for the fixed 50-persona audit tracked in
[Issue #4](https://github.com/Reese-max/travel-planning-mcp/issues/4). The persona IDs, their
identity, and their original success conditions are **inherited unchanged** from the governing
portfolio rules so that results stay comparable across rounds.

- Source of truth: [`Reese-max/autodev-ng` `docs/portfolio-audit/2026-09-06-50-persona-audit.md`](https://github.com/Reese-max/autodev-ng/blob/main/docs/portfolio-audit/2026-09-06-50-persona-audit.md)
- Pinned rules blob: `6e3499d6ef5be7e123050e1526946f6a40f99263`
- Calibration rules: [`docs/portfolio-audit/2026-09-14-issue-quality-v2.md`](https://github.com/Reese-max/autodev-ng/blob/main/docs/portfolio-audit/2026-09-14-issue-quality-v2.md)
- Pinned calibration blob: `8167e10798071d2276addaff6b201c6b0e904a2a`

## How to read this file

| Column | Meaning |
| --- | --- |
| Persona | Fixed persona ID. Never renumbered, never extended, never dropped. |
| Fixed persona (zh-Hant) | Verbatim persona definition from the pinned rules blob. |
| Fixed need (en) | The same success condition in English. Trackers copy this text verbatim. |

Editing a persona ID, its identity, or its need invalidates cross-round comparison and is not
allowed without a new baseline file and a new pinned blob reference. The English column is a
translation aid only; when the two disagree, the pinned zh-Hant column wins.

## Groups

- **A** — teenagers / students, 16–22
- **B** — early career, 23–30
- **C** — professional workers, 31–40
- **D** — management / decision makers, 41–50
- **E** — older users, 51–65
- **F** — 65+
- **G** — accessibility / constrained situations
- **H** — technical / operations
- **I** — stress / failure modes
- **J** — advanced / boundary

## Personas

| Persona | Fixed persona (zh-Hant) | Fixed need (en) |
| --- | --- | --- |
| A01 | 高中生，新手，手機優先，首次使用 | high-school newcomer, mobile-first, first-time user |
| A02 | 大學生，熟悉 Google Docs，但不熟 CLI | university student, fluent in Google Docs, unfamiliar with the CLI |
| A03 | 資工學生，會 Git/CLI，追求可自訂 | computer-science student, fluent in Git/CLI, seeks customization |
| A04 | 考生，時間壓力高，只想最快完成核心任務 | exam candidate, high time pressure, wants the fastest core task |
| A05 | 視覺型學習者，依賴清楚導覽與狀態提示 | visual learner, relies on clear navigation and status cues |
| B01 | 行政人員，Excel 熟練、程式陌生 | administrator, fluent in Excel, unfamiliar with programming |
| B02 | 初階工程師，重視安裝與錯誤訊息 | junior engineer, values installation and error messages |
| B03 | 設計師，重視介面一致性與可逆操作 | designer, values UI consistency and reversible actions |
| B04 | 研究助理，重視資料來源與匯出 | research assistant, values data sources and export |
| B05 | 輪班工作者，手機、碎片時間使用 | shift worker, mobile and fragmented-time use |
| C01 | 警政/公務使用者，重視正確性與稽核軌跡 | police/civil-service user, values correctness and audit trail |
| C02 | 教師，重視多人使用與低學習成本 | teacher, values multi-user use and low learning cost |
| C03 | 醫療/高風險領域使用者，重視免責、來源與錯誤防護 | medical/high-risk user, values disclaimer, sources and error protection |
| C04 | 內容創作者，重視長流程不中斷與版本恢復 | content creator, values uninterrupted long flows and version recovery |
| C05 | DevOps/SRE，重視可觀測性、fail-closed 與回滾 | DevOps/SRE, values observability, fail-closed behaviour and rollback |
| D01 | 單位主管，只看摘要與異常 | unit manager, reads summaries and exceptions only |
| D02 | 專案經理，重視進度、責任與可追蹤性 | project manager, values progress, ownership and traceability |
| D03 | IT 管理員，重視權限、備份、部署 | IT administrator, values permissions, backup and deployment |
| D04 | 採購/成本敏感使用者，重視成本預估與上限 | procurement/cost-sensitive user, values cost estimate and caps |
| D05 | 法遵/稽核角色，重視資料保存、個資與操作證據 | legal-compliance/audit role, values data retention, privacy and operation evidence |
| E01 | 一般辦公室使用者，較少使用新式 Web UI | general office worker, rarely uses modern web UI |
| E02 | 教職/公務人員，偏桌面、大字體需求 | teaching/civil-service user, prefers desktop and large fonts |
| E03 | 低數位熟悉度使用者，怕按錯、需要確認與復原 | low digital familiarity, fears misclicks, needs confirmation and recovery |
| E04 | 熟悉 Excel、不熟雲端部署 | Excel fluent, unfamiliar with cloud deployment |
| E05 | 長時間使用者，重視閱讀性與疲勞 | long-session user, values readability and low fatigue |
| F01 | 高齡初次使用者，需要大字、明確按鈕 | elderly first-time user, needs large text and clear buttons |
| F02 | 視力較弱，依賴高對比與縮放 | reduced vision, relies on high contrast and zoom |
| F03 | 手部操作精度較低，需要較大觸控目標 | reduced hand precision, needs large touch targets |
| F04 | 記憶負荷敏感，需要一步一事與持久狀態 | memory-load sensitive, needs one step at a time and persistent state |
| F05 | 由家人/同事協助設定、之後自行日常操作 | assisted by family/colleagues at setup, then independent daily use |
| G01 | 鍵盤-only | keyboard-only operation |
| G02 | 螢幕閱讀器使用者 | screen-reader user |
| G03 | 色覺辨識限制，不可只靠顏色傳遞狀態 | colour-vision limitation, status must not rely on colour alone |
| G04 | 200% 縮放/窄視窗 | 200% zoom / narrow viewport |
| G05 | 慢網路/高延遲環境 | slow network / high latency |
| H01 | Windows 開發者 | Windows developer |
| H02 | macOS 開發者 | macOS developer |
| H03 | Linux/CI 非互動環境 | Linux/CI non-interactive environment |
| H04 | 自架/Cloudflare 部署者 | self-hosted/Cloudflare deployer |
| H05 | 第三方維護者，第一次接手 repo | third-party maintainer, first time taking over the repo |
| I01 | 重複點擊/重送 | duplicate clicks / resends |
| I02 | 中途關閉頁面/程序後恢復 | recovery after closing the page or the process mid-task |
| I03 | 錯誤檔案/錯誤輸入 | wrong file / wrong input |
| I04 | API timeout/429/5xx | API timeout/429/5xx |
| I05 | 部分成功、部分失敗後重試 | retry after partial success / partial failure |
| J01 | 大量資料/大型專案 | large data / large projects |
| J02 | 多使用者/並行操作 | multi-user and concurrent operation |
| J03 | 長時間連跑/資源耗盡 | long-running use and resource exhaustion |
| J04 | 安全/隱私敏感使用者 | security/privacy-sensitive user |
| J05 | 專家使用者，嘗試最短路徑、自動化與客製 | expert user seeking the shortest path, automation and customization |

## Related

- [Audit rules and process](./README.md)
- [Current tracker](./tracker.md)