# Travel Planning App：TRIP 客製化底座

本目錄以 `itskovacs/trip` 的固定 commit 為底座，保留原始 UI、後端、授權與上游來源。
`TRAVEL-UPSTREAM.json` 記錄確切版本。這是第一階段的開發底座，並非已完成的 AI 行程修改 App。

## 這一輪已準備

- 原始 TRIP 完整原始碼與 MIT `license.txt`，沒有改寫授權歸屬。
- `docker-compose.travel.yml`：自行建置來源、只綁定本機 8080、獨立資料卷。
- 與獨立 `Reese-max/travel-planning-mcp` 的唯讀串接設定說明。
- 原始 MCP 不在這份 Compose 中啟動，避免 AI 直接使用其寫入工具繞過規劃核心。

## 啟動 App

需要 Git、Docker Engine / Desktop 與 Compose。於本目錄執行：

```bash
docker compose -f docker-compose.travel.yml up -d --build
```

使用瀏覽器開啟 `http://localhost:8080`。帳號建立與驗證使用上游原本功能，這份客製化沒有加入預設帳密或放寬驗證。停止請使用 `down`；不要加 `-v`，除非確定要刪除資料卷。

這是本機開發配置，不是直接對 Internet 公開的正式部署。正式服務需再處理 HTTPS、備份、權限與安全審查。

## 連到 AI 核心

在同一主機的 `travel-planning-mcp` 完成 `npm install && npm run build`，於核心目錄建立已被 `.gitignore` 忽略的 `.env.trip`：

```dotenv
TRIP_API_URL=http://127.0.0.1:8080
TRIP_INSTANCE_ID=my-personal-trip
TRIP_API_TOKEN=replace_with_your_own_trip_api_token
```

TRIP API token 只存在核心執行環境；不要交給 AI 當作工具參數，也不要推送 GitHub。核心的 `APPROVAL_API_KEY` 更不應提供給普通 AI 用戶端。

```bash
node --env-file=.env.trip dist/trip-index.js
```

此入口保留核心原本的工具，額外加入 `list_external_trip_trips` 與 `get_external_trip_preview`。它不是遠端 HTTP MCP URL。未設定三個 TRIP 變數時，不會啟用外部 TRIP 工具。

目前只能讀取／預覽 TRIP，不能將外部預覽直接傳给 `get_trip` 當作已存入的核心旅程，也不會寫回 TRIP。

## 哪份資料是權威來源？

此階段的 TRIP 資料庫是 App 的權威來源；核心只讀出外部快照，不另行建立可獨立修改的同名旅程。核心既有 Demo Trip 與外部 TRIP 的 ID、版本、授權是不同範圍。

下一階段必須先實作明確的 import/link、持久化 ID 對照、衝突檢查與批准流程，才可開放雙向同步。不能只把核心 Trip DB 和 TRIP DB 同時寫入，再期待它們永遠一致。

## 後续客製化順序

1. 補完整日期、時區、訂位時間與正式匯入契約。
2. 建立 durable store / synchronization binding，不改 TRIP 的內部資料表格式。
3. 在 App 增加變更比較與人工批准畫面。
4. 經 Proposal → Validate → Approval → Apply 才寫回；補外部版本衝突、部分失敗與重試測試。
5. 再處理繁體中文 UI、品牌與地圖整合。

## GitHub Fork

準備腳本不會建立 GitHub repository。本機 clone 保留名為 `upstream` 的上游 remote，沒有設定可推送的 `origin`。先將 `itskovacs/trip` Fork 為 `Reese-max/travel-planning-app`，再將該 Fork 設為 origin；不要覆蓋 `travel-planning-mcp`。

若使用 ZIP：ZIP 不含 `.git` 歷史；應從上游 Fork/clone 保留歷史，再移入這些客製化檔案，不要把 ZIP 冒稱為 GitHub Fork。
