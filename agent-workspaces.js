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

// Synthetic UK lettings exports: order, transfer instruction, and client-account statement.
AGENT_WORKSPACES['uk-lettings'] = {
  "name": "英国租赁 · 跨系统入账核验",
  "types": [
    {
      "id": "RentalOrder",
      "apiName": "RentalOrder",
      "name": "租赁订单",
      "primaryKey": "order_id",
      "title": "order_id",
      "description": "租赁系统导出的订单",
      "properties": [
        [
          "order_id",
          "order_id",
          "String"
        ],
        [
          "agency_account",
          "agency_account",
          "String"
        ],
        [
          "client_account",
          "client_account",
          "String"
        ],
        [
          "landlord",
          "landlord",
          "String"
        ],
        [
          "landlord_account",
          "landlord_account",
          "String"
        ],
        [
          "amount_pence",
          "amount_pence",
          "Integer"
        ],
        [
          "currency",
          "currency",
          "String"
        ],
        [
          "status",
          "status",
          "String"
        ],
        [
          "uploaded_by",
          "uploaded_by",
          "String"
        ],
        [
          "upload_id",
          "upload_id",
          "String"
        ],
        [
          "created_at",
          "created_at",
          "String"
        ]
      ],
      "rows": [
        [
          "ORD-001",
          "AGENCY-GBP-01",
          "CLIENT-GBP-01",
          "Alder Homes",
          "LANDLORD-01",
          78000,
          "GBP",
          "Pending",
          "agency.ops",
          "UPLOAD-1",
          "2026-10-08T08:01:00Z"
        ],
        [
          "ORD-002",
          "AGENCY-GBP-01",
          "CLIENT-GBP-01",
          "Birch Homes",
          "LANDLORD-02",
          62500,
          "GBP",
          "Pending",
          "agency.ops",
          "UPLOAD-2",
          "2026-10-08T08:01:00Z"
        ],
        [
          "ORD-003",
          "AGENCY-GBP-01",
          "CLIENT-GBP-01",
          "Cedar Homes",
          "LANDLORD-03",
          91000,
          "GBP",
          "Pending",
          "agency.ops",
          "UPLOAD-3",
          "2026-10-08T08:01:00Z"
        ]
      ]
    },
    {
      "id": "TransferInstruction",
      "apiName": "TransferInstruction",
      "name": "支付指令",
      "primaryKey": "transfer_id",
      "title": "transfer_id",
      "description": "用订单号和支付参考号连接租赁系统与银行流水",
      "properties": [
        [
          "transfer_id",
          "transfer_id",
          "String"
        ],
        [
          "order_id",
          "order_id",
          "String"
        ],
        [
          "purpose",
          "purpose",
          "String"
        ],
        [
          "from_account",
          "from_account",
          "String"
        ],
        [
          "to_account",
          "to_account",
          "String"
        ],
        [
          "amount_pence",
          "amount_pence",
          "Integer"
        ],
        [
          "currency",
          "currency",
          "String"
        ],
        [
          "submitted_at",
          "submitted_at",
          "String"
        ]
      ],
      "rows": [
        [
          "REF-1-IN",
          "ORD-001",
          "IN",
          "AGENCY-GBP-01",
          "CLIENT-GBP-01",
          78000,
          "GBP",
          "2026-10-08T08:00:00Z"
        ],
        [
          "REF-1-OUT",
          "ORD-001",
          "OUT",
          "CLIENT-GBP-01",
          "LANDLORD-01",
          78000,
          "GBP",
          "2026-10-08T09:00:00Z"
        ],
        [
          "REF-2-IN",
          "ORD-002",
          "IN",
          "AGENCY-GBP-01",
          "CLIENT-GBP-01",
          62500,
          "GBP",
          "2026-10-08T08:00:00Z"
        ],
        [
          "REF-2-OUT",
          "ORD-002",
          "OUT",
          "CLIENT-GBP-01",
          "LANDLORD-02",
          62500,
          "GBP",
          "2026-10-08T09:00:00Z"
        ],
        [
          "REF-2-REFUND",
          "ORD-002",
          "REFUND",
          "CLIENT-GBP-01",
          "AGENCY-GBP-01",
          62500,
          "GBP",
          "2026-10-08T10:45:00Z"
        ],
        [
          "REF-3-IN",
          "ORD-003",
          "IN",
          "AGENCY-GBP-01",
          "CLIENT-GBP-01",
          91000,
          "GBP",
          "2026-10-08T08:00:00Z"
        ],
        [
          "REF-3-OUT",
          "ORD-003",
          "OUT",
          "CLIENT-GBP-01",
          "LANDLORD-03",
          91000,
          "GBP",
          "2026-10-08T09:00:00Z"
        ]
      ]
    },
    {
      "id": "BankStatementLine",
      "apiName": "BankStatementLine",
      "name": "客户账户银行流水",
      "primaryKey": "line_id",
      "title": "line_id",
      "description": "银行系统导出的客户账户流水",
      "properties": [
        [
          "line_id",
          "line_id",
          "String"
        ],
        [
          "account_id",
          "account_id",
          "String"
        ],
        [
          "counterparty_account",
          "counterparty_account",
          "String"
        ],
        [
          "signed_pence",
          "signed_pence",
          "Integer"
        ],
        [
          "currency",
          "currency",
          "String"
        ],
        [
          "bank_ref",
          "bank_ref",
          "String"
        ],
        [
          "posted_at",
          "posted_at",
          "String"
        ],
        [
          "booking_date_uk",
          "booking_date_uk",
          "String"
        ],
        [
          "return_of",
          "return_of",
          "String"
        ]
      ],
      "rows": [
        [
          "ST-1-IN",
          "CLIENT-GBP-01",
          "AGENCY-GBP-01",
          78000,
          "GBP",
          "REF-1-IN",
          "2026-10-08T08:15:00Z",
          "2026-10-08",
          ""
        ],
        [
          "ST-2-IN",
          "CLIENT-GBP-01",
          "AGENCY-GBP-01",
          62500,
          "GBP",
          "REF-2-IN",
          "2026-10-08T08:15:00Z",
          "2026-10-08",
          ""
        ],
        [
          "ST-3-IN",
          "CLIENT-GBP-01",
          "AGENCY-GBP-01",
          91000,
          "GBP",
          "REF-3-IN",
          "2026-10-08T08:15:00Z",
          "2026-10-08",
          ""
        ],
        [
          "ST-1-OUT",
          "CLIENT-GBP-01",
          "LANDLORD-01",
          -78000,
          "GBP",
          "REF-1-OUT",
          "2026-10-08T09:03:00Z",
          "2026-10-08",
          ""
        ],
        [
          "ST-2-OUT",
          "CLIENT-GBP-01",
          "LANDLORD-02",
          -62500,
          "GBP",
          "REF-2-OUT",
          "2026-10-08T09:03:00Z",
          "2026-10-08",
          ""
        ],
        [
          "ST-3-OUT",
          "CLIENT-GBP-01",
          "LANDLORD-03",
          -91000,
          "GBP",
          "REF-3-OUT",
          "2026-10-08T09:03:00Z",
          "2026-10-08",
          ""
        ],
        [
          "ST-2-RETURN",
          "CLIENT-GBP-01",
          "LANDLORD-02",
          62500,
          "GBP",
          "REF-2-OUT",
          "2026-10-08T10:10:00Z",
          "2026-10-08",
          "ST-2-OUT"
        ],
        [
          "ST-2-REFUND",
          "CLIENT-GBP-01",
          "AGENCY-GBP-01",
          -62500,
          "GBP",
          "REF-2-REFUND",
          "2026-10-08T10:50:00Z",
          "2026-10-08",
          ""
        ]
      ]
    }
  ],
  "links": [
    {
      "id": "transfer-order",
      "from": "TransferInstruction",
      "to": "RentalOrder",
      "property": "order_id",
      "forward": [
        "租赁订单",
        "order"
      ],
      "reverse": [
        "支付指令",
        "transfers"
      ]
    },
    {
      "id": "statement-transfer",
      "from": "BankStatementLine",
      "to": "TransferInstruction",
      "property": "bank_ref",
      "forward": [
        "支付指令",
        "transfer"
      ],
      "reverse": [
        "银行流水",
        "statementLines"
      ]
    }
  ],
  "actionTypes": [],
  "actions": {},
  "views": [],
  "examples": [
    {
      "text": "ORD-001 的钱到账了吗？请沿订单的 transfers 找到 IN 支付指令，再沿 statementLines 查询流水。核对金额、币种和两端账户，只报告客户账户是否入账，并列出证据编号。"
    }
  ]
}
