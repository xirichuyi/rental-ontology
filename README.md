# Ontology Lab

本地业务模拟器，用 Object、Link、Action 和 AIP 查询演示租约及机票改签业务。
这不是 Palantir 官方实现；工具协议、上下文格式及数量限制由本项目定义。

LoftyWorks 场景：启动后打开图形化租约流程台 `/?workspace=loftyworks#/lofty-business`，选租约、看进度、点下一步。全部业务操作在 `/?workspace=loftyworks#/lofty-operations`。
110 个 Object Type 覆盖 107 张来源表与 3 个本地补充模型，199 个 Link、57 个 Action 支持收租、供应商、押金、退款、管理费、续退租、文档及财务批次。
`/?workspace=loftyworks#/lofty-catalog` 逐项显示结构接入、业务操作、历史记录及未实现行为，避免把表数量当成业务完成度。
操作步骤、来源映射与范围见 [LOFTYWORKS.md](./LOFTYWORKS.md)。

## 启动

需要 Node.js。默认使用已通过 ChatGPT 登录的本机 Codex CLI：

```powershell
node server.mjs
```

打开 http://127.0.0.1:43219/#/aip 。也可以设置 `RENTAL_PORT`。
已有的 OpenAI-compatible Chat Completions 接入仍可通过
`RENTAL_MODEL_PROVIDER=chat_completions`、`OPENAI_API_KEY`、
`OPENAI_BASE_URL`、`OPENAI_MODEL` 配置。

## AI 如何读取业务数据

1. 在 AIP 的「配置范围」中选择 Object Type、属性和方向 Link。首次采用已保存类型；之后新增类型须手动开放。主键用于引用对象。
2. 每轮先发送问题、对话上下文、视图、可用 Action 数量，以及最多 12 个类型摘要。不会预先发送全部对象记录或完整 Action 目录。
3. 模型可用 `search_object_types` 分页搜索类型，用 `describe_object_type` 获取所选类型的字段及 Link 定义。
4. `query_ontology` 支持直接查编号、条件过滤、计数、分页，以及最多三跳 Search Around。`related` 仅筛选起点；`traverse` 会切换到关联对象类型。
5. 平台执行工具，将受配置范围限制的结果返回模型。模型可继续请求工具，每轮最多 8 次，每页最多 50 个对象。计数不受分页截断影响。
6. `search_actions` 按业务词及 Object Type 搜索已开放的 Action，每页最多 8 个摘要；`describe_action` 读取所选 Action 的参数与变更效果。服务端要求先读取定义，才允许 `prepare_action` 生成草稿。用户确认后走原有参数和 Submission criteria 校验，再显示字段变化和 Action Log。

## 英国租赁跨系统流转

打开 `/?workspace=uk-lettings#/uk-integration`。三个本地入口分别接收租赁订单、支付指令和银行流水。点击「完整跑一次 ORD-001」会依次向三个入口投递原始样例，也可以分别投递来验证乱序和重复记录。

服务端创建独立演示后，返回本次运行的 ID。系统适配器可向 `POST /api/uk-integration/{id}/orders`、`/payments`、`/bank` 发送各来源的 JSON 记录。每笔有效投递都会重新执行第一段入账核验，变更的结果会写入本地模拟租赁系统的状态，并留下回写记录。通过 `GET /api/uk-integration/{id}` 可查看来源记录、回写状态和流转记录。

从演示页进入 Datasets 或 AIP 时，当前浏览器使用本次运行收到的记录。演示记录保存在本地服务进程中，刷新页面可恢复本次运行，重启服务后需要重新开始。三套系统均为模拟接入，核验范围为租赁机构付款进入客户账户。

## 租房闭环体验

打开 `/?workspace=rental-demo#/aip`。这是单独保存的演示工作区，首次打开会通过 `signLease` 创建张三的租约 `L-DEMO-001`，房屋为 `H01`，月租 8500。

页面的五个步骤使用真实模型调用：

1. **查房与租约**：从张三通过 `Tenant.leases → Lease.house` 查询房屋与到期日。
2. **续签租约**：搜索 Action、读取 `renewLease` 定义，准备新到期日及月租 8800；打开确认表单后提交。
3. **核验续签**：重新查询租约，确认新到期日、月租和状态。
4. **办理退租**：读取 `terminateLease`，确认提交后将租约改为已结束，同时把房屋改为空置、清空当前租客。
5. **核验退租**：再次查询两个对象，核对执行结果。Action Log 包含签约、续签和退租三次成功提交。

每轮下方可展开实际模型上下文、调用参数和返回值。只准备草稿不会改数据，验证失败不会产生业务修改或成功日志。角色切换为只读访客后不开放这些写入动作。

参考的是 Palantir 的[配置 Agent 工具](https://www.palantir.com/docs/foundry/agent-builder/getting-started)和[Action 参数与校验](https://www.palantir.com/docs/foundry/action-types/parameter-overview)机制。本项目的 Action 搜索、每页数量和确认流程是本地实现，不代表 Palantir 内部的工具检索算法。搜索使用名称/描述关键词匹配，没有向量检索；没有命中时可以换词或分页浏览。

「Retrieval context」可选地预先提供某个类型前 1–5 条对象，最多 8 个开放属性，每个值最多 120 个字符。这是固定集合预取，尚未实现向量、文档或 Function-backed retrieval。

「查看实际发送给 AI 的信息」展示该轮实际初始业务上下文、工具定义，以及每次工具参数和返回值；不展示服务端系统指令。修改开放范围会清空当前对话，避免携带旧数据。

示例问题：`张三关联的房屋月租金分别是多少？包括历史租约，不要按日期筛选。`
数据不足时应返回空结果或说明缺项；工作台不会为回答自动创建业务记录。

## 实现边界

业务数据和配置保存在浏览器 localStorage 中；查询由浏览器执行，服务端负责模型调用、工具参数验证和多轮调度。当前角色和开放范围是模拟器功能，不构成生产级服务端身份认证或行列权限系统。用于生产时必须把查询、写入和授权移到可信服务端，不能信任客户端上传的目录及查询结果。

## 验证

```powershell
node --test test/*.test.mjs
```

查询测试使用隔离的内存样例，不修改浏览器业务数据；服务端协议测试使用本机模拟模型，不消耗真实模型额度。
