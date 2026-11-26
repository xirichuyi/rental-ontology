# Link、Action、AIP 创建与执行

入口：`http://127.0.0.1:43224/?workspace=builder#/build`。代码分支为 `feature/loftyworks-business-flow`。

工作区初始只有三张数据集及对应 Object Type（Tenant、Lease、House），没有 Link、Action、助手和 Action Log。浏览器验证中的配置由创建表单逐项输入，不由初始化函数写入。

## 官方依据与本地实现

| 创建部分 | 官方流程 | 本地实现及本次补充 |
|---|---|---|
| Link | 选择 foreign key / join table / backing object；映射资源、命名两个方向、选择保存位置，再保存 Ontology | 已有三种关系向导；补充匹配结果预览和 join table 列存在性、主键类型检查。预览显示未匹配行，不把缺少目标对象的行算成关系。 |
| Action | 选择对象与规则、映射属性、生成参数；配置参数值范围、Submission Criteria；测试和提交 | 保留已有 Rules、Parameters、Form、Submission Criteria 详情；向导新增可选参数值、对象属性条件与错误提示，以及创建摘要。生成条件进入同一执行校验器。 |
| AIP Chatbot | 新建命名资源，配置 Instructions、可访问的对象和工具，测试、发布 | 新增助手列表、草稿保存、独立发布版本、对象/属性/方向 Link/Action 选择、可选 Retrieval context；运行使用发布版本，修改草稿不改变已发布助手。 |
| Action tool | 工具明确添加到助手，模型按定义调用 | 助手仅暴露勾选的 Action。模型搜索候选、读取参数定义、准备表单；用户确认后通过现有 Action 校验器执行。显示调用参数、结果、对象修改前后值和 Action Log。 |

依据：[Create a link type](https://www.palantir.com/docs/foundry/object-link-types/create-link-type)、[Action types — Getting started](https://www.palantir.com/docs/foundry/action-types/getting-started)、[AIP Chatbot Studio — Getting started](https://www.palantir.com/docs/foundry/chatbot-studio/getting-started)、[Chatbot tools](https://www.palantir.com/docs/foundry/chatbot-studio/tools)。查阅日期：2026-11-26。

## 实现边界

这是依据公开创建流程实现的本地工作台，不是 Palantir 源码或完整 Foundry 实现。数据和助手配置保存在当前浏览器的工作区中；权限是本地角色模拟，没有服务端身份认证、分布式对象存储、多人协作或真实项目 ACL。

当前助手工具覆盖 Object Query、需要用户确认的 Action，以及本地运行时支持的已发布同步只读 Function；未实现官方的自动执行 Action、应用变量、其他应用 Command、文档检索与完整模型管理。模型由本地服务配置。初始类型摘要数量、Action 搜索协议、调用步数上限属于本项目设计，不能视为 Palantir 的内部实现。

## 工具业务说明

在 AIP Chatbot Studio 编辑助手时，可以分别填写查询工具的 Tool description、每个 Action 的 Tool description，以及勾选的每个 Function 的 Tool description。说明用于交代使用场景、查询路径、参数来源、返回值含义及前后检查。每项最多 4000 字符；Save draft 只保存草稿，Publish 后才进入该助手的对话，其他助手不受影响。

查询说明会随 `query_ontology` 的工具定义和 `toolGuidance` 上下文提供给模型；Action 说明随搜索和读取 Action 定义返回。Function 目录只提供已开放函数的名称、版本、参数、返回类型和说明，不发送源码。Function 可选择 Latest 或固定的已发布版本，模型通过 `call_function` 调用，结果和版本可在对话轨迹查看。未开放类型、属性、方向 Link 不会因 Function 调用而开放；编辑函数须经 Action 提交。

这些是本项目的配置与传递实现，依据官方工具及说明概念设计，不代表复制了 Palantir 的内部提示词或执行协议。

## Link、Interface 与 Function Action

Link Action 的 Create link / Delete link 用于 Join table 支撑的多对多关系，提交后可沿该关系查询。普通外键关系通过修改外键属性维护；中间对象支撑的关系通过创建或修改中间对象维护。

Interface Action 可创建、修改、删除实现该接口的具体对象，也可按实现映射创建或删除关系。创建时选择具体 Object Type；修改和删除时选择 Interface reference。只有接口属性能用于通用属性映射。模型收到接口的可用实现类型、参数格式与属性映射；表单与提交时再次检查助手开放范围和实现类型的禁用配置。Interface Action 当前不生成独立 Action Log；通过执行回执和对象回查验证结果。

Function Action 使用仓库中已发布的 `@OntologyEditFunction`，绑定函数参数、版本及 `@Edits` 所声明的对象类型。它可以是工作区级动作，无需绑定一个展示用 Object Type。AIP 发布和工具发现检查参数及编辑目标是否开放；执行先收集编辑，全部校验成功才写入，函数抛错不会留下部分修改。只读 `@Function` 使用单独的 Function 工具配置，不作为编辑 Action。

2026-11-26 修复了 Interface Action 和工作区级 Function Action 被 AIP 类型筛选排除的问题。新增测试覆盖工具发现、接口具体类型选择、越界提交拒绝、接口对象创建/修改/删除、接口关系创建/删除、函数写入与失败回滚。页面验证脚本在 `outputs/action-kinds/`，独立练习地址的 `practice=action-kinds-1126`；该练习通过页面创建接口、实现映射、两个 Action 和助手，没有向原房东工作区写入测试配置。

页面结果：同一个 `renameNamedEntity` Interface Action 分别修改 Tenant T101、House H101；发布 `RentalEdits.rename` 1.0.0 后，通过工作区级 Function Action 修改 Tenant T102。随后真实模型分别搜索这两个 Action、读取定义、查询目标、准备确认表单；页面确认后，T101 为“张三（AI接口验证）”，T102 为“李四（AI函数验证）”。完整工具调用、参数与变更回执保存于 `outputs/action-kinds/verification.json`。本轮全套测试 56/56 通过，`git diff --check` 通过。

这些能力运行于本地模拟器。Webhook、Notification 和调度效果仍为本地模拟，并未接入生产外部服务；不能根据创建窗口有这些选项就视为完整实现了 Foundry。

## 验证材料

`test/authoring.test.mjs` 验证从空配置创建两跳 Link、参数枚举和对象状态条件、失败时数据不变、助手发布隔离、无效 join 映射。

`outputs/authoring/round-*.mjs` 是本次真实浏览器操作记录。它们只通过页面控件创建配置；读取页面状态用于核验。截图和模型工具轨迹保存在同一目录。浏览器状态属于该浏览器：其他浏览器打开会得到自己的空创建工作区。

## 2026-11-26 页面实测结果

1. 从 0 条 Link、0 个 Action、0 个助手开始。原始数据包含张三 T101、房屋 H101/H102、有效租约 L101 和已结束租约 L102。
2. 页面创建 Lease → Tenant、Lease → House 两条外键 Link，分别命名正反方向。新建 `adjustActiveLeaseRent`，映射月租参数为 6600/6800/7000，添加“租约状态必须为有效”的 Submission Criterion，保存 Ontology。
3. 页面创建“租约运营助手 · 页面创建”，选择三种类型、四个方向 Link 和上述 Action，写入 Instructions 并发布 v1。真实模型执行 Tenant → leases → Lease → house → House，返回 H101“朝阳一居”。
4. 模型搜索 Action、读取定义、准备 L101 月租 6800 的表单。先在页面改选 L102 并提交，系统按对象状态条件拒绝。改回 L101 试运行显示 6500 → 6800，确认提交后再次查询返回 6800、有效。见 `rent-trace.json`。
5. 页面另外创建空 Join table 支撑的 Tenant ↔ House“意向房屋”关系，创建 `registerHouseInterest`（Create link），再将新关系和 Action 加入助手并发布 v2。
6. 真实模型准备 T101 ↔ H102 的关联表单，页面试运行、确认提交，回执显示“未关联 → 已关联”。再次沿 `interestedHouses` 查询返回 H102“海淀两居”。见 `link-trace.json`。

最终共有 3 条 Link、2 个 Action、1 个发布至 v2 的助手，成功操作记录为 2 条。失败提交没有修改数据。

最终校验：`node --test test/*.test.mjs` 为 47/47 通过；`git diff --check`、JavaScript 语法检查通过。已查看桌面截图及 390px 宽的助手编辑页面，未发现横向溢出。

## 首次使用入口与独立练习

创建业务应用页面新增“新建空白练习工作区”。每次点击生成独立的 `practice` 地址，只有原始对象数据；不会修改原工作区的配置、数据或操作记录。浏览器会按该地址单独保存进度，保留地址即可继续。

首页显示已保存的 Link、Action、已发布助手和操作次数，并提示未保存的 Ontology 更改。页面内提供四步展开式填写说明，覆盖两条 Link、月租 Action、助手工具配置及实际提问和回查。助手发布失败时，缺项持续显示在页面上；未保存的 Ontology 可以直接从助手编辑页检查并保存。

新增独立存储与重新打开练习的回归测试；当前全套测试为 48/48 通过。首次使用实测脚本及证据位于 `outputs/onboarding/`。
