/**
 * Create order amendment 8 — the checkout layout in a real browser (Chromium via Playwright). The page is the one
 * test/create-order.js renders under its stubs (CO_DUMP_PAGE). Skips (exit 0) when Playwright isn't installed.
 *
 *   NODE_PATH=$(npm root -g) node test/create-order-layout.js
 *
 *   L1  desktop (1440, 1001): the panel right of the quotes, sticky; no footer; no sideways scroll
 *   L2  phone / narrow (1000, 768, 375, 320): the panel below the quotes, the slim footer "Customer pays £x"; no
 *       sideways scroll; nothing outside its card
 *   L3  an unticked quote is one line with its inputs hidden; ticking expands it; unticking collapses it
 *   L4  the live panel and card figures = buildOrderSummary; the six shared cases agree in the browser
 */
'use strict';

var path = require('path');
var fs   = require('fs');
var cp   = require('child_process');
var os   = require('os');

var pw = null;
['playwright', '@playwright/test'].some(function (m) { try { pw = require(m); return true; } catch (e) { return false; } });
if (!pw || !pw.chromium) { console.log('skip — Playwright is not installed (NODE_PATH=$(npm root -g) node test/create-order-layout.js)'); process.exit(0); }

var ROOT = path.join(__dirname, '..');
var CASES = require('./order-summary-cases.js');
var failures = 0, passes = 0;
function ok(cond, msg) { if (cond) { passes++; console.log('  ok   ' + msg); } else { failures++; console.log('  FAIL ' + msg); } }

var page = path.join(os.tmpdir(), 'create-order-layout-' + process.pid + '.html');
cp.execFileSync(process.execPath, [path.join(__dirname, 'create-order.js')], { cwd: ROOT, env: Object.assign({}, process.env, { CO_DUMP_PAGE: page }) });

// the library's own function, for the expected figures
var lib;
(function () {
    var src = fs.readFileSync(path.join(ROOT, 'nuheat_order_lib.js'), 'utf8');
    var vm = require('vm');
    var sandbox = { define: function (d, f) { lib = f.apply(null, d.map(function (x) { return x === 'N/cache' ? { Scope: {} } : {}; })); }, console: console };
    vm.runInNewContext(src, sandbox);
})();

function geometry() {
    function box(sel) { var e = document.querySelector(sel); if (!e) return null; var b = e.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top + scrollY, bottom: b.bottom + scrollY, width: b.width, height: b.height }; }
    var outside = [];
    document.querySelectorAll('.nsq-qrow, .nsq-panel, .nsq-footer-in').forEach(function (c) {
        var cb = c.getBoundingClientRect(); if (!cb.width) return;
        c.querySelectorAll('*').forEach(function (e) { var r = e.getBoundingClientRect(); if (r.width && e.offsetParent !== null && (r.right > cb.right + 0.5 || r.left < cb.left - 0.5)) outside.push(e.className || e.tagName); });
    });
    var foot = document.querySelector('.nsq-footer-slim');
    return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, panel: box('#nsq-panel'), quotes: box('.nsq-co-quotes'),
             footer: getComputedStyle(foot).display !== 'none', footerText: document.getElementById('nsq-sum-line').textContent, outside: outside };
}

(async function () {
    var browser = await pw.chromium.launch();
    try {
        for (var w of [1440, 1001, 1000, 768, 375, 320]) {
            var p = await browser.newPage({ viewport: { width: w, height: 900 } });
            var errors = []; p.on('pageerror', function (e) { errors.push(e.message); });
            await p.goto('file://' + page);
            console.log('Width ' + w);
            // L3: unticked quote = one line, inputs hidden
            var collapsed = await p.evaluate(function () { var r = document.querySelector('.nsq-qrow[data-qid="901"]'); return { h: r.getBoundingClientRect().height, qin: getComputedStyle(r.querySelector('.nsq-qin')).display, dashed: getComputedStyle(r).borderTopStyle }; });
            ok(collapsed.qin === 'none' && collapsed.dashed === 'dashed' && collapsed.h < 60, 'L3 unticked: one dashed line (' + Math.round(collapsed.h) + 'px), inputs hidden');
            await p.check('.nsq-qsel[data-qid="901"]'); await p.check('.nsq-qsel[data-qid="902"]');
            await p.fill('#nsq-comm-902', '5');
            var expanded = await p.evaluate(function () { var r = document.querySelector('.nsq-qrow[data-qid="901"]'); return { h: r.getBoundingClientRect().height, qin: getComputedStyle(r.querySelector('.nsq-qin')).display, units: r.querySelector('.nsq-units').disabled }; });
            ok(expanded.qin !== 'none' && expanded.units === false && expanded.h > collapsed.h + 30, 'L3 ticking expands it (' + Math.round(expanded.h) + 'px), inputs enabled');
            var g = await p.evaluate(geometry);
            ok(g.overflow === 0, 'no sideways scroll');
            ok(g.outside.length === 0, 'nothing outside its card / panel / footer' + (g.outside.length ? ' (' + g.outside.slice(0, 4).join(', ') + ')' : ''));
            if (w > 1000) {
                ok(g.panel.left >= g.quotes.right && Math.abs(g.panel.width - 380) < 1 && g.panel.top === g.quotes.top, 'L1 the panel (380px) right of the quotes');
                ok(!g.footer, 'L1 no footer on desktop');
                await p.evaluate(function () { window.scrollTo(0, 900); });
                var top = await p.evaluate(function () { return document.getElementById('nsq-panel').getBoundingClientRect().top; });
                ok(Math.abs(top - 16) < 1, 'L1 the panel stays in view while the page scrolls (top ' + Math.round(top) + 'px)');
            } else {
                ok(g.panel.top >= g.quotes.bottom - 1 && Math.abs(g.panel.left - g.quotes.left) < 1, 'L2 the panel below the quotes');
                ok(g.footer && g.footerText === 'Customer pays £12,524.12', 'L2 the slim footer: "' + g.footerText + '"');
            }
            // L4: the live figures = buildOrderSummary
            var shown = await p.evaluate(function () {
                return { panel: document.getElementById('nsq-panel').innerText.replace(/\s+/g, ' '), card: document.querySelector('.nsq-qrow[data-qid="902"] .nsq-qprice').innerText.replace(/\u2060/g, '').replace(/\s+/g, ' '),
                         button: document.getElementById('nsq-send').textContent, calc: document.querySelector('.nsq-qrow[data-qid="902"] .nsq-comm-calc').textContent };
            });
            ok(shown.card === '£10,508.81 BUS voucher −£7,500.00 Customer pays £3,008.81', 'L4 the heat pump card: "' + shown.card + '"');
            ok(shown.panel.indexOf('HP235874 · Heat Pump (ASHP) £10,508.81 BUS voucher · Standard −£7,500.00 Customer pays £3,008.81') !== -1 &&
               shown.panel.indexOf('Orders total £20,024.12 inc VAT (VAT £2,086.30)') !== -1 && shown.panel.indexOf('Customer pays £12,524.12') !== -1 &&
               shown.panel.indexOf('Deposit due now · 20% £2,504.82') !== -1 && shown.panel.indexOf('Balance before delivery £10,019.30') !== -1 &&
               shown.panel.indexOf('The orders keep their full value. The BUS voucher is taken off at invoice.') !== -1, 'L4 the panel’s figures');
            ok(shown.button === 'Create 2 orders' && shown.calc === '= £500.42', 'L4 "Create 2 orders"; "= £500.42" beside the commission');
            await p.uncheck('.nsq-qsel[data-qid="902"]');
            var pending = await p.evaluate(function () { return { pend: !document.getElementById('nsq-ps-pending').hidden, note: document.getElementById('nsq-ps-note').hidden, card: document.querySelector('.nsq-qrow[data-qid="901"] .nsq-qv').hidden, qin: getComputedStyle(document.querySelector('.nsq-qrow[data-qid="902"] .nsq-qin')).display }; });
            ok(pending.pend && pending.note && pending.card && pending.qin === 'none', 'L3/L4 unticking the heat pump quote: it collapses; "applies when a heat pump quote is ordered"; no deduction');
            if (w === 1440) {
                // the page's own inlined copy (it lives inside the page script's closure), run by Chromium
                var inPage = await p.evaluate(function (cases) {
                    var src = Array.prototype.map.call(document.querySelectorAll('script'), function (x) { return x.textContent; }).join('\n');
                    var build = new Function(src.substring(src.indexOf('function pickVoucherOrder('), src.indexOf('  var CAPPED = ')) + '\nreturn buildOrderSummary;')();
                    return cases.map(function (c) { return JSON.stringify(build(c.input)); });
                }, CASES);
                CASES.forEach(function (c, k) { ok(inPage[k] === JSON.stringify(lib.buildOrderSummary(c.input)), 'L4 case ' + (k + 1) + ' in Chromium = node (' + c.name + ')'); });
            }
            ok(errors.length === 0, 'no script error' + (errors.length ? ': ' + errors[0] : ''));
            await p.close();
        }
    } finally {
        await browser.close();
        try { fs.unlinkSync(page); } catch (e) { /* gone */ }
    }
    console.log('\n' + passes + ' passed, ' + failures + ' failed');
    process.exit(failures ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
