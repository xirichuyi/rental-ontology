import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { reconcileInbound } from '../outputs/UK-Lettings-Two-Leg-Demo-v2/reconcile-inbound.mjs'

const sources = {
  orders: { file: 'orders', key: 'order_id', fields: ['order_id', 'agency_account', 'client_account', 'currency'], money: 'amount_pence' },
  payments: { file: 'transfer-instructions', key: 'transfer_id', fields: ['transfer_id', 'order_id', 'purpose', 'from_account', 'to_account', 'currency'], money: 'amount_pence' },
  bank: { file: 'client-account-statement', key: 'line_id', fields: ['line_id', 'account_id', 'counterparty_account', 'bank_ref', 'currency'], money: 'signed_pence' },
}
const demoKeys = { orders: 'ORD-001', payments: 'REF-1-IN', bank: 'ST-1-IN' }
const runs = new Map()

function snapshot(run) {
  return {
    id: run.id,
    sources: Object.fromEntries(Object.entries(run.sources).map(([name, records]) => [name, [...records.values()]])),
    rentalWritebacks: [...run.writebacks.values()],
    history: run.history,
  }
}

function receive(run, source, record) {
  const schema = sources[source]
  if (!record || schema.fields.some(field => typeof record[field] !== 'string' || !record[field].trim()) ||
    !Number.isSafeInteger(record[schema.money]) || (source !== 'bank' && record[schema.money] <= 0) ||
    (source === 'bank' && record.return_of != null && typeof record.return_of !== 'string')) {
    return { status: 400, body: { error: '来源记录缺少必填字段，或金额并非整数便士。' } }
  }
  const fields = [...schema.fields, schema.money, ...(source === 'bank' ? ['return_of', 'posted_at'] : [])]
  const row = Object.fromEntries(fields.map(field => [field, record[field] ?? null]))
  const key = row[schema.key]
  const existing = run.sources[source].get(key)
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(row)) {
      return { status: 409, body: { error: '相同来源编号已存在，记录内容不一致。' } }
    }
    run.history.push({ kind: 'duplicate', source, key })
    return { status: 200, body: snapshot(run) }
  }

  run.sources[source].set(key, row)
  run.history.push({ kind: 'received', source, key })
  const inputs = Object.keys(sources).map(name => [...run.sources[name].values()])
  for (const result of reconcileInbound(...inputs)) {
    const previous = run.writebacks.get(result.order_id)
    if (JSON.stringify(previous) === JSON.stringify(result)) continue
    run.writebacks.set(result.order_id, result)
    run.history.push({ kind: 'writeback', key: result.order_id, status: result.status })
  }
  return { status: 200, body: snapshot(run) }
}

export async function handleUkIntegration(method, path, readBody) {
  const root = '/api/uk-integration'
  if (path === root && method === 'POST') {
    const id = randomUUID()
    const run = { id, sources: Object.fromEntries(Object.keys(sources).map(name => [name, new Map()])), writebacks: new Map(), history: [] }
    runs.set(id, run)
    return { status: 201, body: snapshot(run) }
  }
  const match = path.slice(root.length).match(/^\/([a-f0-9-]{36})(?:\/(orders|payments|bank)(\/sample)?)?$/)
  const run = match && runs.get(match[1])
  if (!run) return { status: 404, body: { error: '未找到本次演示。请开始一次新的演示。' } }
  if (method === 'GET' && !match[2]) return { status: 200, body: snapshot(run) }
  if (method !== 'POST' || !match[2]) return { status: 405, body: { error: '此接口不支持该请求方法。' } }

  const source = match[2]
  if (!match[3]) return receive(run, source, await readBody())
  const { file, key } = sources[source]
  const fixture = new URL(`../outputs/UK-Lettings-Two-Leg-Demo-v2/01-input/${file}.jsonl`, import.meta.url)
  const lines = (await readFile(fixture, 'utf8')).trim().split(/\r?\n/)
  const record = lines.map(line => JSON.parse(line)).find(row => row[key] === demoKeys[source])
  return receive(run, source, record)
}
