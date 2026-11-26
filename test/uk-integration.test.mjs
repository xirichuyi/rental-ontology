import assert from 'node:assert/strict'
import test from 'node:test'
import { handleUkIntegration } from '../uk-integration.mjs'

const root = '/api/uk-integration'
async function post(path = '', record) {
  const response = await handleUkIntegration('POST', root + path, async () => record)
  assert.ok(response.status < 300, JSON.stringify(response.body))
  return response.body
}

test('the three UK lettings sources trigger state transitions and duplicate delivery does not repeat writeback', async () => {
  const { id } = await post()
  const order = await post(`/${id}/orders/sample`)
  assert.equal(order.rentalWritebacks[0].status, 'missing_instruction')
  const payment = await post(`/${id}/payments/sample`)
  assert.equal(payment.rentalWritebacks[0].status, 'awaiting_statement')
  const bank = await post(`/${id}/bank/sample`)
  assert.equal(bank.rentalWritebacks[0].status, 'client_account_credited')
  assert.equal(bank.rentalWritebacks[0].matched_line_id, 'ST-1-IN')
  const duplicate = await post(`/${id}/bank/sample`)
  assert.equal(duplicate.history.at(-1).kind, 'duplicate')
  assert.equal(duplicate.history.filter(event => event.kind === 'writeback').length, 3)
})

test('bank-first deliveries match on arrival of the other records and a later reversal updates rental status', async () => {
  const { id } = await post()
  const bank = await post(`/${id}/bank/sample`)
  assert.deepEqual(bank.rentalWritebacks, [])
  await post(`/${id}/payments/sample`)
  const order = await post(`/${id}/orders/sample`)
  assert.equal(order.rentalWritebacks[0].status, 'client_account_credited')
  const reversal = { ...bank.sources.bank[0], line_id: 'ST-REV', signed_pence: -78000, return_of: 'ST-1-IN' }
  const result = await post(`/${id}/bank`, reversal)
  assert.equal(result.rentalWritebacks[0].status, 'credit_reversed')
})
