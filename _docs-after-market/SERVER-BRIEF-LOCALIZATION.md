# 第 4 批：天气城市 / 交货信息的汉化

> 纯界面改动（`ui/src`），**不碰宿主、不用重编 exe**；部署 `ui/dist` 后重启 App 即可。
> 与本批一起的还有“蜻蜓FM WebApp”（第 3 批，`SERVER-BRIEF-QINGTING.md`）——那个要重编 exe。

---

## 1. 现象

- 天气页/天气控件：位置显示 **Paris**（地图标签的“本地名”），不是“巴黎”。
- 交货控件：公司 **Transportes Caballeria**、城市 **Valladolid** 是拉丁字母，其余“交货 / 周一 04:48 前到达 / 1082 km”已是中文。

## 2. 根因

| 信息 | 来源 | 为什么没中文 |
|---|---|---|
| 天气城市 | 地图的 `labels`（`MapLabel`） | 天气取的是 `labelLines(...).first`，即**地点自己的名字**（`name`，Paris）；地图同时带 `localized`（玩家语言，巴黎），但天气没用它 |
| 交货城市 | 游戏作业数据 `JobInfo.destinationCity` | 游戏 SDK 给的是地名（Valladolid），UI 原样显示；地图 `labels` 里有同一城市的 `localized`（巴利亚多利德） |
| 交货公司 | `JobInfo.destinationCompany` | 游戏的公司名（Transportes Caballería）是专有名词，游戏本身不做中文翻译；地图数据里公司也没有 `localized` |

地图数据里 **374 个城市都带中文 `localized`**（实测：Paris→巴黎、Valladolid→巴利亚多利德、Kraków→克拉科夫），所以城市不需要另做词典。

## 3. 改法

新增 `ui/src/cabin/dashboard/placeNames.ts`：

- `plainName(name)`：比较用，忽略大小写、变音符号、多余空格（`Caballeria` = `Caballería`，`Krakow` = `Kraków`）。
- `cityName(name, labels)`：用地图里城市的 `name` / `localized` 找到它，返回 `localized`（中文）；找不到就保留原名。
- `companyName(name)`：227 个游戏公司的中文词典（当前地图里全部公司，含 Iberia/DLC/西里尔/希腊名），按 `plainName` 匹配；词典没有的保留原名（宁可保留品牌名，也不瞎翻）。

`ui/src/cabin/dashboard/destination.ts`：

- `nearestCity()` 改为返回 `label.localized || label.name`（天气、路线终点都走它）。
- `destinationView()` 的取货/交货：城市走 `cityName()`，公司走 `companyName()`；公司为空（特殊运输）时标题用中文城市。

天气页 `WeatherApp.tsx` 与天气控件 `widgets.tsx` 都用 `nearestCity()`，无需再改。

## 4. 验证

- `tsc -b` 0 错误；`vitest run` **442 passed**（新增：地图 `localized` 的城市名、公司 `Transportes Caballeria` → 卡瓦列里亚运输）。
- 实际地图数据抽查：`Paris→巴黎`、`Valladolid→巴利亚多利德`、`Lyon→里昂`、`Milano→米兰`。
- 部署：`ui/dist` 已更新到 `D:\WestPlay\ui`（备份在 `D:\WestPlay-ui-backup-*`）。重启 WestPlay 后天气/交货即为中文。

## 5. 注意

- 城市的 `localized` 来自**建图时**的游戏语言。这棵树/这台机器的地图是中文的，所以城市全中文；如果某张地图是用其他语言建的，`localized` 可能不是中文，城市会退回该语言（要覆盖需再维护城市词典）。
- 公司词典按当前游戏/地图的 227 家公司生成；新 DLC 或地图 mod 的新公司会保留英文名，补一行即可。
- 本机安装的 `ui/dist` **临时隐藏了蜻蜓FM**（旧 exe 不认 `qingting`，避免点开一直 Opening）。源码和构建机产出的 `ui/dist` 仍包含蜻蜓FM，等新 exe 一起部署。
