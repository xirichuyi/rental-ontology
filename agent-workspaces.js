const AGENT_WORKSPACES = {
  rental: {
    name: '租约业务',
    linkNotes: {
      'house-tenant': '此关系由房屋的「当前租客」字段维护。租约到期后，可通过「到期结清」更新房屋状态和关系。'
    },
    actions: {
      'sign-lease': {
        enabled: true,
        replacementParameter: 'house'
      },
      'transfer-lease': {
        enabled: true,
        replacementParameter: 'tenant'
      },
      'terminate-lease': {
        enabled: true
      }
    },
    views: [{
      id: 'currentLease',
      name: '租客当前租约',
      description: '给定租客姓名或编号，查询当前租住的房屋、租约和到期日。',
      root: 'Tenant',
      lookup: ['id', 'name'],
      links: [
        { apiName: 'leases', auditProperties: ['start', 'end', 'status'], filters: [
          { property: 'status', operator: 'eq', value: '有效', reason: '状态不为有效' },
          { property: 'start', operator: 'lte', value: '$asOf', reason: '尚未起租' },
          { property: 'end', operator: 'gt', value: '$asOf', reason: '到期日已过或已到' }
        ] },
        { apiName: 'house', optional: true }
      ],
      columns: [
        { step: 2, property: 'name', label: '房屋', link: true },
        { step: 1, property: 'end', label: '到期日' },
        { step: 1, property: 'id', label: '租约', link: true }
      ]
    }, {
      id: 'leaseHistory',
      name: '租客所有关联租约',
      description: '按租客姓名或编号查所有已关联的租约，含历史、将来起租和日期异常的记录。',
      root: 'Tenant',
      lookup: ['id', 'name'],
      links: [{ apiName: 'leases' }, { apiName: 'house', optional: true }],
      columns: [
        { step: 1, property: 'id', label: '租约', link: true },
        { step: 2, property: 'name', label: '房屋', link: true },
        { step: 1, property: 'start', label: '起租日' },
        { step: 1, property: 'end', label: '到期日' },
        { step: 1, property: 'status', label: '保存的合同状态' }
      ]
    }],
    examples: [
      { text: '张三现在租哪套房，什么时候到期？' },
      { text: '我们现在有多少位租客？' },
      { text: '帮李四另签朝阳区公寓。', action: 'signLease' },
      { text: '可以换一套吗？', whenDraft: true }
    ]
  },
  flight: {
    name: '机票改签样例',
    actions: {
      'rebook-flight': {
        enabled: true,
        replacementParameter: 'target_flight',
        lookup: { booking: { link: 'passenger' } }
      }
    },
    views: [{
      id: 'passengerBooking',
      name: '旅客已出票订单',
      description: '给定乘客姓名或编号，查询已出票的订单及当前航班。',
      root: 'Passenger',
      lookup: ['id', 'name'],
      links: [
        { apiName: 'bookings', filters: [{ property: 'status', operator: 'eq', value: '已出票' }] },
        { apiName: 'flight' }
      ],
      columns: [
        { step: 1, property: 'id', label: '订单', link: true },
        { step: 2, property: 'id', label: '航班', link: true },
        { step: 2, property: 'departure', label: '起飞时间' }
      ]
    }],
    examples: [
      { text: '王小明现在订了哪一班飞机？' },
      { text: '帮王小明把已出票的航班改到 CA1867。', action: 'rebookFlight' },
      { text: '可以换另一班吗？', whenDraft: true }
    ],
    types: [
      {
        id: 'passenger', apiName: 'Passenger', name: '旅客', icon: '👤',
        properties: [['id', '旅客编号', 'String'], ['name', '姓名', 'String']],
        rows: [['P01', '王小明'], ['P02', '林小雨']]
      },
      {
        id: 'flight', apiName: 'Flight', name: '航班', icon: '✈',
        properties: [
          ['id', '航班号', 'String'], ['name', '航班名称', 'String'], ['origin', '出发地', 'String'],
          ['destination', '目的地', 'String'], ['date', '出发日', 'Date'],
          ['departure', '起飞时间', 'String'], ['status', '改签状态', 'String']
        ],
        rows: [
          ['CA1851', 'CA1851 · 北京至上海', '北京', '上海', '2026-12-18', '08:10', '可改签'],
          ['CA1867', 'CA1867 · 北京至上海', '北京', '上海', '2026-12-18', '15:20', '可改签'],
          ['CA1881', 'CA1881 · 北京至上海', '北京', '上海', '2026-12-18', '20:30', '可改签'],
          ['CA1873', 'CA1873 · 北京至上海', '北京', '上海', '2026-12-18', '16:40', '停止改签'],
          ['CA1315', 'CA1315 · 北京至广州', '北京', '广州', '2026-12-18', '17:30', '可改签']
        ]
      },
      {
        id: 'booking', apiName: 'Booking', name: '机票订单', icon: '🎫', title: 'id',
        properties: [
          ['id', '订单号', 'String'], ['passenger_id', '旅客编号', 'String'], ['flight_id', '当前航班号', 'String'],
          ['origin', '出发地', 'String'], ['destination', '目的地', 'String'],
          ['date', '出发日', 'Date'], ['status', '订单状态', 'String']
        ],
        rows: [
          ['BK-1001', 'P01', 'CA1851', '北京', '上海', '2026-12-18', '已出票'],
          ['BK-1002', 'P02', 'CA1851', '北京', '上海', '2026-12-18', '已出票']
        ]
      }
    ],
    links: [
      { id: 'booking-passenger', from: 'booking', to: 'passenger', property: 'passenger_id', forward: ['旅客', 'passenger'], reverse: ['订单', 'bookings'] },
      { id: 'booking-flight', from: 'booking', to: 'flight', property: 'flight_id', forward: ['当前航班', 'flight'], reverse: ['订单', 'bookings'] }
    ],
    actionTypes: [{
      id: 'rebook-flight', apiName: 'rebookFlight', name: '机票改签',
      description: '为已出票订单更换到同一出发日、同一航线且可改签的另一航班。',
      objectType: 'booking',
      parameters: [
        { id: 'booking', name: '原机票订单', type: 'Object reference', objectType: 'booking', default: { kind: 'currentObject', value: '' } },
        { id: 'target_flight', name: '新航班', type: 'Object reference', objectType: 'flight' }
      ],
      rules: [{
        type: 'modify', objectType: 'booking', objectParam: 'booking',
        mappings: [{ prop: 'flight_id', source: 'param', value: 'target_flight' }]
      }],
      criteria: [
        { kind: 'user', groups: ['managers', 'agents'], message: '当前角色无法改签。' },
        { kind: 'param', left: 'booking.status', op: 'is', rightKind: 'value', right: '已出票', message: '原订单须已出票。' },
        { kind: 'param', left: 'target_flight.status', op: 'is', rightKind: 'value', right: '可改签', message: '目标航班须开放改签。' },
        { kind: 'param', left: 'target_flight.id', op: 'isNot', rightKind: 'param', right: 'booking.flight_id', message: '新航班必须与原航班不同。' },
        { kind: 'param', left: 'target_flight.origin', op: 'is', rightKind: 'param', right: 'booking.origin', message: '新航班出发地须相同。' },
        { kind: 'param', left: 'target_flight.destination', op: 'is', rightKind: 'param', right: 'booking.destination', message: '新航班目的地须相同。' },
        { kind: 'param', left: 'target_flight.date', op: 'is', rightKind: 'param', right: 'booking.date', message: '样例仅支持同日改签。' }
      ],
      actionLog: { enabled: true, summary: '/booking 改签至 /target_flight' }
    }]
  }
}
