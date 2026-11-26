const UK_SOURCE_LABELS = { orders: '租赁系统', payments: '支付系统', bank: '银行系统' }
const UK_STATUS_LABELS = {
  missing_instruction: '等待支付指令', awaiting_statement: '等待银行入账流水',
  client_account_credited: '已到客户账户', credit_reversed: '入账已冲回',
  multiple_instructions: '存在多条入账指令', instruction_conflict: '支付指令不一致',
  ambiguous_credit: '存在多条候选流水', statement_conflict: '银行流水与指令不符',
}
let ukRun = null
let ukBusy = false
let ukError = ''
let ukRestored = false

function ukDatasetRows(name, dataset) {
  const source = { RentalOrder: 'orders', TransferInstruction: 'payments', BankStatementLine: 'bank' }[name]
  if (WORKSPACE_ID !== 'uk-lettings' || !ukRun || !Object.hasOwn(UK_SOURCE_LABELS, source)) return dataset.rows
  return ukRun.sources[source].map(record => dataset.fields.map(field => record[field] ?? ''))
}

function restoreUkIntegration() {
  if (WORKSPACE_ID !== 'uk-lettings' || ukRestored) return
  ukRestored = true
  if (sessionStorage.getItem('uk-integration-run')) void runUkIntegration('restore')
}

async function ukRequest(path, method) {
  const response = await fetch('/api/uk-integration' + path, { method })
  const result = await response.json()
  if (!response.ok) throw Error(result.error)
  return result
}

async function runUkIntegration(operation) {
  if (ukBusy) return
  ukBusy = true
  ukError = ''
  render()
  try {
    if (operation === 'restore') {
      ukRun = await ukRequest('/' + encodeURIComponent(sessionStorage.getItem('uk-integration-run')), 'GET')
    } else {
      if (!ukRun || operation === 'start' || operation === 'run-all') {
        ukRun = await ukRequest('', 'POST')
        sessionStorage.setItem('uk-integration-run', ukRun.id)
      }
      const stages = operation === 'run-all' ? Object.keys(UK_SOURCE_LABELS) : [operation]
      for (const stage of stages.filter(stage => Object.hasOwn(UK_SOURCE_LABELS, stage))) {
        ukRun = await ukRequest('/' + ukRun.id + '/' + stage + '/sample', 'POST')
        render()
      }
    }
  } catch (error) {
    ukError = error.message
    if (operation === 'restore') sessionStorage.removeItem('uk-integration-run')
  } finally {
    ukBusy = false
    render()
  }
}

function pageUkIntegration() {
  const disabled = ukBusy ? 'disabled' : ''
  const sourceCard = (source, title, description) => {
    const rows = ukRun?.sources[source] ?? []
    return '<article class="card"><h3>' + title + '</h3><p>' + description + '</p>' +
      B('ukIntegration', '发送样例记录', '', source, disabled) +
      (rows.length ? '<details><summary>查看收到的原始字段（' + rows.length + '）</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">' +
        esc(JSON.stringify(rows, null, 2)) + '</pre></details>' : '<p class="muted">等待来源数据</p>') + '</article>'
  }
  const writebacks = (ukRun?.rentalWritebacks ?? []).map(row =>
    '<tr><td>' + esc(row.order_id) + '</td><td>' + esc(UK_STATUS_LABELS[row.status]) + '</td><td>' +
    esc(row.reference ?? '—') + '</td><td>' + esc(row.matched_line_id ?? row.statement_line_ids?.join('、') ?? '—') + '</td></tr>').join('')
  const history = (ukRun?.history ?? []).map(event => {
    if (event.kind === 'writeback') return '<li>回写租赁系统 · ' + esc(event.key) + ' · ' + esc(UK_STATUS_LABELS[event.status]) + '</li>'
    return '<li>' + esc(UK_SOURCE_LABELS[event.source]) + ' · ' + esc(event.key) +
      (event.kind === 'duplicate' ? ' · 重复投递已忽略' : ' · 已接收并触发核验') + '</li>'
  }).join('')
  return head('跨系统业务流转', '本地模拟三个来源。任一来源发送记录后，服务端自动匹配并回写租赁系统。只核验客户账户入账。',
    B('ukIntegration', '完整跑一次 ORD-001', 'primary', 'run-all', disabled) + B('ukIntegration', '新建空白演示', '', 'start', disabled)) +
    (ukError ? '<p role="alert">' + esc(ukError) + '</p>' : '') +
    '<div class="row" style="align-items:stretch;flex-wrap:wrap">' +
    sourceCard('orders', '租赁系统', '订单 ORD-001 · 应付 £780') +
    sourceCard('payments', '支付系统', '指令 REF-1-IN · 携带订单号') +
    sourceCard('bank', '银行系统', '流水 ST-1-IN · 携带支付参考号') + '</div>' +
    '<section class="card"><h3>租赁系统状态回写</h3><div class="scroll"><table><thead><tr><th>订单</th><th>入账状态</th><th>支付参考号</th><th>银行流水</th></tr></thead><tbody>' +
    (writebacks || '<tr><td colspan="4">等待租赁订单</td></tr>') + '</tbody></table></div></section>' +
    '<section class="card"><h3>流转记录</h3>' + (history ? '<ol>' + history + '</ol>' : '<p class="muted">发送任一来源的记录开始演示</p>') +
    '</section><p><a href="#/datasets">查看本次同步的数据</a> · <a href="#/link-types">查看 Ontology 外键配置</a> · <a href="#/aip">用 AIP 查询本次数据</a></p>'
}
