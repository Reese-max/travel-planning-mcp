# TRIP App + Travel Planning MCP：第一階段整合

## 決策

保留 `Reese-max/travel-planning-mcp` 作為獨立規劃核心；以 `itskovacs/trip` 作為另一個 App repository 的底座。預計名稱 `Reese-max/travel-planning-app`。Wanderlog MCP 只供研究，不是執行依賴；這一輪不使用 MapAnNai 原始碼。

目前工具沒有 GitHub Fork／repository 建立操作，所以這份變更**沒有建立遠端 App repository**。它提供可重現的來源準備腳本、原始碼包、唯讀 API Adapter 及測試。不要把下載或打包成功說成 Fork／部署成功。

## 實際上游基準

| 用途 | Repository | 固定 commit |
|---|---|---|
| App 底座 | `itskovacs/trip` | `46a4ab4e28dcc761388f81865db5a5ef8050d7aa` |
| 設計參考，不執行 | `shaikhspeare/wanderlog-mcp` | `b946034eb1b39180de0c7276cbaeb84ccf0ddd90` |

版本集中在 `integrations/upstreams.lock.json`。App 準備流程保留 MIT `license.txt` 與原始程式，不把第三方程式改標成我們的著作。

## 最小整合方式

```text
TRIP App（原有 UI / POI / 行程 / 使用者資料庫）
                 │  僅 GET /api/trips 與 GET /api/trips/{id}
                 ▼
TripReadClient（驗證回應、遮蔽敏感欄位、保留未知資訊）
                 │
                 ▼
Travel Planning MCP 的外部資料預覽工具（AI 唯讀）
                 │
                 │  操作員帶著 review 過的 fingerprint 匯入（REST，需要 approval credential）
                 ▼
Canonical Trip v1（import_source 記錄來源；後續變更仍走 ChangeProposal）
```

**不改 TRIP 內部資料表，也不讓兩套資料庫同時成為同一旅程的權威來源。**匯入後 TRIP 仍是來源；核心保存 canonical Trip 並記錄來源身分與 fingerprint，**沒有任何寫回 TRIP 的路徑**。既有核心 Demo Trip 仍維持原來的 Proposal/Approval 保護。

## 已實作的功能

- `TripReadClient.listTrips(offset, limit)`：列出外部旅程，回傳來源、讀取時間與分頁資訊。
- `TripReadClient.previewTrip(id)`：取得資料映射預覽、來源 fingerprint、缺漏與不能同步的欄位。
- `list_external_trip_trips`、`get_external_trip_preview`：唯讀研究工具。
- `preview_external_trip_import`：回傳明確的 `source`、`source_trip_id`、`canonical_preview`、`unresolved_fields`、`warnings`、`conflicts` 匯入預覽；不持久化、不產生 Reservation、不授權匯入。
- `src/trip-index.ts`：保留原有核心工具，僅在操作員設定完整時加掛 TRIP 工具。
- `scripts/bootstrap-travel-workspace.mjs`：固定版本 clone、來源檢查、保留上游 remote、加入 App overlay。拒絕覆蓋既有資料夾。
- `scripts/package-travel-workspace.py`：建立 App／Wanderlog 參考原始碼 ZIP 與 SHA-256 provenance。
- CI：核心型別／測試／建置、來源準備、Compose 語法檢查、上游 Python 語法檢查與 Artifact。

## 實際資料映射與限制

| TRIP 原欄位／能力 | 這一輪的處理 |
|---|---|
| 整數 `Trip.id` / `Place.id` / `Item.id` | 以 operator 設定的 instance ID 分區，映射成穩定 UUID；不代表已持久化或具有權限 |
| `TripDay.dt` 可為 null | 原樣保留並回報 `MISSING_DATE`，不以今天或其他日期補值 |
| `TripItem.time` 為當地時間，可為 null | 正規化 `09` 為 `09:00`，但不捏造時區或 RFC 3339 時間 |
| `TripItem.place` 是巢狀地點物件 | 依 `place.id` 建立對照；相同 ID 內容矛盾則拒絕，不無聲覆蓋 |
| `booked`、`constraint` 行程狀態 | 在預覽保留 locked，避免後續誤當成可自由移動 |
| `TripBooking` 有 label/type/reference，沒有起訖時間 | 留在 `unresolved_bookings`；不生成不符合核心契約的 Reservation，也不把未提供的確認狀態標成 confirmed |
| 原始備註、訂位代碼、附件與同行者身分 | 不送到 AI 預覽；只保留規劃所需名稱、時段與地點 |
| SHA-256 fingerprint | 綁定 provider、operator 設定的穩定 instance ID、source trip ID 與原始快照；不含 API URL／token。**不是服務端交易版本／ETag**，不能宣稱解決競爭寫入 |
| 上游回應缺欄位、錯誤或不一致 | 拒絕並回傳錯誤，不把失敗假裝成空旅程 |

`preview_external_trip_import` 只把上述已正規化且可安全提供規劃的欄位放入
`canonical_preview`。`unresolved_fields` 保留需要人工或正式匯入流程補齊的問題；
`conflicts` 目前在一致的快照上為空，矛盾的來源資料會直接拒絕，避免產生看似
可匯入但實際不可信的預覽。

本階段刻意不產生完整 `Trip`／`Reservation` 假資料。要完成正式匯入，還需日期、時區、跨日邏輯、訂位起訖與歸屬授權等資料。

## 第二階段：受控匯入（canonical trip v1）

匯入流程是 read → normalize → preview → **explicit import approval** → canonical Trip v1，
入口只有 REST `POST /v1/external/trips/{externalTripId}/import`。

| 匯入規則 | 實際處理 |
|---|---|
| 需要 `X-Approval-Key` 與 `Idempotency-Key` | 與 approve/apply/rollback 同一條 operator 憑證分界 |
| 沒有 MCP 匯入工具 | AI client 不能把 preview 變成 canonical 資料 |
| 伺服器端重新讀取來源 | 不接受呼叫端自帶 payload，避免匯入未經 review 的內容 |
| 必填 `source_fingerprint` | 使用 read-only preview 回傳且操作員已 review 的指紋；省略回 `400`，來源 instance 或快照改變回 `409 preview_stale`。舊的未綁定來源指紋必須重新取得預覽 |
| 匯入重試的 scope | provider + instance ID + source trip ID；不同實例不共用匯入回應。同一實例更換 token／URL alias 仍可回放完成的請求；缺少合法 instance ID 時先拒絕，不查舊 receipt |
| 重複匯入 | 同一份 fingerprint 再匯入回 `status: "duplicate"`，不產生第二個 canonical Trip |
| 來源快照改變 | 回 conflict，不靜默覆蓋既有 canonical Trip |
| `TripDay.dt` 為 null | 該日不匯入並回報 `MISSING_DATE`；完全沒有日期時整筆拒絕 |
| 多個 `TripDay` 共用同一日期 | 合併成一個 canonical day 並在 `warnings` 說明，避免匯出後整個 Trip 永遠無法通過驗證 |
| `TripItem.time` 沒有時區 | 不推導 `start_at`；當地時間留在 `source_timing` 並回報 `TIMEZONE_UNKNOWN` |
| `TripBooking` 沒有起訖時間 | 不生成 Reservation，也不預設 09:00；回報 `BOOKING_TIMING_UNKNOWN` |
| 既有 canonical Place | 不覆蓋，讓操作員／使用者後來編輯的 metadata 留著 |
| 匯入後 | `import_source` 記來源 provider／instance／trip id／fingerprint／`imported_at`／核准者，並寫 `external_trip_imported` audit event |
| 之後的修改 | 只能走 `create_change_proposal → validate → 人類核准 → apply`，AI 不能直接改匯入後的 Trip |

匯入回應固定回傳 `status`、`source`、`source_trip_id`、`source_fingerprint`、
`imported_at`、`counts`、`unresolved_fields`、`warnings`、`conflicts`，讓 UI 可以直接顯示
「匯入了什麼、還缺什麼」，而不是假裝資料完整。`unresolved_fields` 最多列 100 筆，
超過的以 `UNRESOLVED_TRUNCATED` 標記，完整數量看 `counts.unresolved_total`。
`conflicts` 只記錄匯入時必須做的結構判斷（多日合併成一天、來源已 archived、
provider place 已存在而未覆寫）；真正不能安全處理的狀態（來源無日期、來源已變更、
preview 身分不符）一律丟 error，不會降級成報告。

匯入 v1 之後仍**沒有**寫回 TRIP，也沒有 durable 的跨系統對照表；client fingerprint 只能
偵測讀取內容不同，不能取代上游交易版本檢查。

## 安全邊界

TRIP endpoint 與 API token 由操作員環境提供，不能由模型參數指定任意 URL。僅允許 HTTPS，或本機 loopback 的 HTTP；禁止 URL 內帳密、query、fragment，禁止跟隨重新導向。要求 JSON、設定逾時與回應大小上限，錯誤不回傳原始 body 或金鑰。

API token 以 `X-Api-Token` 傳入，**不表示上游 token 已具有 read-only scope**；唯讀是我們這層只實作 GET 的限制。應使用專用帳號／隔離環境，並保護操作員憑證。不要把 token 或 `APPROVAL_API_KEY` 貼入 MCP 工具參數。

上游原生 MCP 有直接修改操作，因此不在客製化 Compose 啟動，也不和我們的安全核心一起交給 AI。App 中使用者直接修改 TRIP 的行為仍存在；未来正式寫回必須檢查這類外部修改。

## 準備與啟動

在核心 repository 目錄執行，需 Node.js 22 與 Git：

```bash
node scripts/bootstrap-travel-workspace.mjs ../travel-workspace
```

結果是兩個獨立目錄，而不是把上游程式塞進核心 runtime：

```text
travel-workspace/
  travel-planning-app/     # TRIP 原碼、上游歷史、customized-base 分支與 overlay
  wanderlog-reference/    # 只供研究，未安裝套件、未讀取 Session Cookie
```

App 啟動：

```bash
cd ../travel-workspace/travel-planning-app
docker compose -f docker-compose.travel.yml up -d --build
```

其餘憑證與 MCP 設定見 overlay 的 `CUSTOMIZATION.md`。App 不會自動公開部署到雲端。`node dist/trip-index.js` 是 stdio 入口，**不是 ChatGPT 可直接填入的遠端 MCP URL**。

## 下一阶段驗收條件

1. 在 GitHub 建立真正的 App Fork；設定 core/app 的上游更新策略。
2. 已完成受控匯入（第二階段）；仍需 durable 的跨系統對照表、時區／訂位模型與上游授權檢查，才算完整匯入基礎。
3. App 新增 Proposal 差異與批准畫面；批准能力不交給 AI。
4. 在上游寫回端提供交易版本檢查或等效原子條件寫入；client fingerprint 不足以替代。
5. 實測拒絕舊版、部分失敗、重試去重、回復；最後才開啟寫回與遠端 MCP。

## 驗證範圍

新增測試使用合成 fixtures／mock transport，涵蓋 GET-only、資料遮蔽、來源 ID、時間缺漏、重複／矛盾資料、逾時、容量、錯誤、URL 安全與工具註冊。匯入測試再涵蓋：需要明確核准、preview 契約與 instance 身分檢查、來源改變衝突、重複匯入冪等、不捏造日期／時區／Reservation、audit 與 `import_source`、canonical schema 不允許的額外欄位，以及 REST 匯入路由的 approval／idempotency／stale fingerprint／replay 行為。CI 的原始碼下載／打包是真實操作；Compose/Python 語法檢查不是前端建置或真實使用者旅程端到端驗收。這一輪沒有真實 TRIP 帳號、沒有外部旅程存取、沒有完成寫回，不能宣稱 production-ready。

## 上游依據

- API endpoint 與 `item.place`：https://github.com/itskovacs/trip/blob/46a4ab4e28dcc761388f81865db5a5ef8050d7aa/mcp-server/server.py
- Auth header：https://github.com/itskovacs/trip/blob/46a4ab4e28dcc761388f81865db5a5ef8050d7aa/mcp-server/auth.py
- 欄位與 nullable date：https://github.com/itskovacs/trip/blob/46a4ab4e28dcc761388f81865db5a5ef8050d7aa/backend/trip/models/models.py
- MIT license：https://github.com/itskovacs/trip/blob/46a4ab4e28dcc761388f81865db5a5ef8050d7aa/license.txt
