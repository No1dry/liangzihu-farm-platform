# 三诚闸门只读 MQTT 接入契约状态

> 2026-10-10 新增：三诚单螺杆闸门（SCZM-LG，固件 VER:V2.4.05.000000.0000）只读采集第一阶段。仅被动订阅设备上行 JSON 并入库测值；不实现、不预埋任何下行查询或控制。契约与来源 `verified` 均为 false，真实接入未开放。

## 协议依据与边界

- 依据：厂家协议文件《闸门设备通过mqtt对接协议》（PDF），设备品牌三诚、型号 SCZM-LG、固件 VER:V2.4.05.000000.0000，首台接入设备编号 hbdxscz001。
- 上行主题每台一个：`/sdscdevice/gate/hbdxscz260302/publish/hbdxsczXXX`（XXX=001..029），设备编号取主题最后一段；下行主题为同路径 `publish` 换 `sub`。
- 本阶段只读边界：只订阅上行 `publish` 主题。协议中的下行 rw_prot 查询/控制 JSON（dir=down/rsp、带指令 ID）与 Modbus RTU 透传备用通道（9600/8/N/1，从站1，0x03/0x06）均属于后续工作项，代码中没有任何下行 publish 路径或开关闸命令构造；控制请求在数据库层仍保持未下发。

## 上行报文与字段处理

自动上行 JSON（上报间隔设备侧可设，单位秒）形如：

```json
{"params":{"dir":"up","id":"1728629601","sys_sn":"...","sys_imei":"...","sys_time":"1728629601","r_data":[{"name":"opening","value":0}]}}
```

- 解析要求 `dir="up"`；采样时间取 `sys_time`（缺省用 `id` 兜底），Unix 秒转 Date；两者都缺时不拿收到时间伪造，记 `unknown_sample_time`。
- 幂等：`source_record_id` 取 `sys_sn/sys_imei/sys_time` 实际携带字段的组合；配合观测内容哈希去重，broker 重投与进程重启不会重复入库。
- 带 `"err":"1"` 的字段：rawValue 保留原值、value 置空、quality 记 invalid、原因记 `vendor_field_error`（与仁科离线状态同等方式）。
- value 支持数字或数字字符串；非数字不报错崩溃，记 invalid/`invalid_number`、原值保留，不会成为当前有效值。
- 单位换算当前全部为 scale=1/offset=0：currentMax 堵转电流 mA、opening 当前开度 %、setOpening 设置开度 %、cumulativeFlows 累计流量 m³、waterLevel 水位 mm、instantaneousFlow 瞬时流量 m³/s。pulseEquivalent 脉冲当量未登记为测点，报文中出现时跳过。

## 测点映射（登记工具 `registry:gate`）

| 报文字段 | 平台 metric | 单位 | 测点 code（首台） |
|---|---|---|---|
| opening | opening | % | GATE-001-OPENING |
| waterLevel | water_level | mm | GATE-001-WATER-LEVEL |
| instantaneousFlow | instantaneous_flow | m³/s | GATE-001-INSTANT-FLOW |
| cumulativeFlows | cumulative_flow | m³ | GATE-001-CUMULATIVE-FLOW |
| setOpening | set_opening | % | GATE-001-SET-OPENING |
| currentMax | stall_current | mA | GATE-001-STALL-CURRENT |

`externalDeviceId + metric` 必须唯一映射到一个 pointId，缺失或重复整体拒绝，不取第一项。未绑定对象前测值无法入库（resolvePointBinding 拒绝/隔离），属于预期。

## 已核实 / 待核实

已核实（来自厂家协议文件）：上行主题结构、params 包装、r_data 名称/数值结构、err 标记存在、字段含义与单位、id/sys_time 为 Unix 秒。

待现场或厂家核实（`verified` 置真前必须完成）：

- 真实 broker 地址、端口、TLS 与账号权限（账号存在于厂家资料，绝不写入仓库）。
- 设备在线/离线状态字段与 err 的完整语义（除 `"err":"1"` 外是否还有其他取值）。
- 各字段数值范围、字节序类问题（JSON 无字节序，但累计流量位数/溢出行为待确认）。
- 上报间隔实际配置与断网补报行为（MQTT 推送无分页，游标只记最近采样时间作断点参考，不做漏报补拉）。
- 多台设备 XXX=002..029 的编号与台账对应。

## 部署约定

- `GATE_MQTT_ENABLED` 默认 0；broker URL、客户端 ID 用 `GATE_MQTT_URL` / `GATE_MQTT_CLIENT_ID`；用户名密码只经 `GATE_CREDENTIAL_USERNAME` / `GATE_CREDENTIAL_PASSWORD` 放 `.env.local`，契约文件与仓库不保存任何凭据。
- 设备为单中心上报：正式接入需厂家把 DTU 指向我方 broker，当前 broker 地址未知。
- 采集配置（sourceId、actorId、测点映射）放私有契约文件，路径由 `GATE_CONTRACT_FILE` 指定，不入库。
- 并发防护：常驻订阅按 `gate-mqtt:<sourceId>` 取 advisory lock，重复启动返回 busy；心跳复用 `ingest` 服务名（实例 `gate-mqtt-<pid>`），与仁科拉取共用同一服务行，二者不应同时常驻。
- 回放：`worker:gate --replay 契约文件 报文信封文件`，信封 `{"topic":"...","payload":{...}}`；合成报文只能进 agri_test（`--synthetic-replay`），真实脱敏报文才可进开发库。
