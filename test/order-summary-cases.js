/**
 * Six buildOrderSummary cases (Create order amendment 8), shared by test/create-order.js (node, the library and the
 * page's inlined copy) and test/create-order-layout.js (the same cases evaluated in Chromium).
 */
'use strict';

var UFH = { id: '901', label: 'EST901', typeLabel: 'UFH', incVat: 9515.31, exVat: 7929.43, isHeatPump: false };
var HP  = { id: '902', label: 'HP235874', typeLabel: 'Heat pump', incVat: 10508.81, exVat: 10008.39, isHeatPump: true };
var HP2 = { id: '905', label: 'HP235900', typeLabel: 'Heat pump', incVat: 8200, exVat: 7809.52, isHeatPump: true };
var HPLOW = { id: '906', label: 'HP200001', typeLabel: 'Heat pump', incVat: 4200, exVat: 4000, isHeatPump: true };

module.exports = [
    { name: 'UFH + heat pump, Standard, up front 20%',
      input: { orders: [UFH, HP], voucher: { amount: 7500, label: 'Standard' }, depositPct: 20, upFront: true } },
    { name: 'two heat pump quotes: the first (page order) only',
      input: { orders: [HP, HP2], voucher: { amount: 9000, label: 'Enhanced' }, depositPct: 20, upFront: true } },
    { name: 'low-value heat pump: capped, nothing carried to the UFH order',
      input: { orders: [UFH, HPLOW], voucher: { amount: 7500, label: 'Standard' }, depositPct: 20, upFront: true } },
    { name: 'no heat pump quote: pending note, no deduction',
      input: { orders: [UFH], voucher: { amount: 7500, label: 'Standard' }, depositPct: 20, upFront: true } },
    { name: 'account customer: no deposit',
      input: { orders: [UFH, HP], voucher: { amount: 7500, label: 'Standard' }, depositPct: 20, upFront: false } },
    { name: 'no voucher, no %, ex VAT unknown on one order',
      input: { orders: [UFH, { id: '903', label: 'EST903', typeLabel: 'Parts', incVat: '500', exVat: null, isHeatPump: false }], voucher: { amount: 0, label: '' }, depositPct: null, upFront: true } }
];
