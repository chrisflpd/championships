// drives the tabs the way the camp does: opens the page, submits a
// configuration, changes a match on the plan, types scores on the pages and
// reads the points back off the standings.
const fs = require('fs');
const path = require('path');
const http = require('http');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const CONFIGS = process.argv.length > 2 ? process.argv.slice(2) : ['examples/input26g.txt', 'test/configs/unnamed-zone.txt'];

// the same one browser behaviour page.js puts back, for the same reason
const SHIM = `<script>
// jsdom's postMessage event.source is null; JSZip's browser task queue expects
// window. Give it an equivalent timer queue for asynchronous compression.
window.setImmediate = callback => window.setTimeout(callback, 0);
window.clearImmediate = id => window.clearTimeout(id);
Array.prototype.forEach.call(document.forms, function (form) {
	Array.prototype.forEach.call(form.elements, function (el) {
		if (el.name && !(el.name in form))
			Object.defineProperty(form, el.name, { get: function () { return el; }, configurable: true });
	});
});
</script>`;

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.txt': 'text/plain' };

const server = http.createServer((req, res) => {
	const name = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html';
	const file = path.join(ROOT, name);
	if (!fs.existsSync(file)) {
		res.writeHead(404).end('no');
		return;
	}
	let body = fs.readFileSync(file);
	if (name === 'index.html')
		body = Buffer.from(body.toString('utf8').replace(/(?=<script src="src\/js\/common\.js)/, SHIM), 'utf8');
	res.writeHead(200, { 'Content-Type': (TYPES[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8' });
	res.end(body);
});

const vc = new VirtualConsole();
const noise = [];
vc.on('jsdomError', e => noise.push('jsdomError: ' + e.message));
vc.on('error', (...a) => noise.push('console.error: ' + a.join(' ')));

/**
 * a second visit: the page opened again with what the first one left in the
 * browser, and nothing else done to it.
 *
 * @param {number} port
 * @param {object} kept - what is in the browser as the page opens
 * @param {string} before - the slots of the plan the first visit left
 * @param {function} check
 * @param {function} click - the click of the first visit, which is another window
 * @returns {Promise<void>}
 */
async function second(port, kept, before, check) {
	const dom = await JSDOM.fromURL(`http://127.0.0.1:${port}/index.html`, {
		runScripts: 'dangerously',
		resources: 'usable',
		pretendToBeVisual: true,
		virtualConsole: vc,
		beforeParse(window) {
			//what the first visit left, there before a line of the page has run
			Object.keys(kept).forEach(key => window.localStorage.setItem(key, kept[key]));
		},
	});
	const { window } = dom;
	const doc = window.document;
	await new Promise(res => {
		if (doc.readyState === 'complete') return res();
		window.addEventListener('load', res);
	});
	await new Promise(res => window.setTimeout(res, 300));

	const offer = doc.querySelector('.saved-offer');
	check(offer !== null, 'a second visit is offered the championship the first one left, on opening');
	if (offer === null) {
		window.close();
		return;
	}
	check(/αποθηκευμένο πρωτάθλημα/.test(offer.textContent),
		`saying what is there: ${offer.querySelector('span').textContent}`);
	// folded or not, the offer has to be readable: it is the first thing there is
	// to do with the page
	const panel = doc.querySelector('.panel-config');
	check(panel !== null && !panel.querySelector('.panel-body').contains(offer),
		'and stands where a folded configuration cannot hide it');
	check(doc.querySelector('.day-list') === null, 'with nothing drawn until it is asked for');

	[...offer.querySelectorAll('button')].find(b => b.textContent === 'Άνοιγμα')
		.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
	check(doc.querySelector('.saved-offer') === null && doc.querySelector('.day-list') !== null,
		'opening it draws the program, with no search run for it');
	check(Object.keys(window.eval('workbook').slots).sort().join('|') === before,
		'and every match is where the first visit left it');
	check(doc.querySelectorAll('.sheet-tab').length === 4, 'under the four tabs, as ever');
	window.close();
}

/**
 * the championship handed to somebody else: a link made in one browser, opened
 * in another that has never seen the configuration.
 *
 * @param {number} port
 * @param {string} link
 * @param {string} before - the slots of the plan the link was made from
 * @param {function} check
 * @returns {Promise<void>}
 */
async function shared(port, link, before, check) {
	const dom = await JSDOM.fromURL(link.replace(/^[^#]*/, `http://127.0.0.1:${port}/index.html`), {
		runScripts: 'dangerously',
		resources: 'usable',
		pretendToBeVisual: true,
		virtualConsole: vc,
	});
	const { window } = dom;
	const doc = window.document;
	await new Promise(res => {
		if (doc.readyState === 'complete') return res();
		window.addEventListener('load', res);
	});
	for (let i = 0; i < 500 && !doc.querySelector('.day-list') && !doc.querySelector('#search.is-error'); i++)
		await new Promise(res => window.setTimeout(res, 10));

	check(doc.querySelector('.day-list') !== null, 'a link opens the championship it carries, with no search run for it: ' + doc.getElementById('search-status').textContent);
	check(Object.keys(window.eval('workbook').slots).sort().join('|') === before,
		'every match of it where the maker of the link left it');
	check(doc.forms[0]['config'].value.length > 0, 'and the configuration it was made from in the box');
	// looking at somebody else's leaves your own where it was
	check(window.eval('appStorage').getItem('workbook') === null,
		'and nothing of it written over a championship of your own');
	check(doc.querySelector('.saved-offer') === null, 'with nothing else offered over the top of it');
	window.close();
}

async function run(CONFIG, fail) {
	const port = server.address().port;
	const dom = await JSDOM.fromURL(`http://127.0.0.1:${port}/index.html`, {
		runScripts: 'dangerously',
		resources: 'usable',
		pretendToBeVisual: true,
		virtualConsole: vc,
	});
	const { window } = dom;
	const doc = window.document;
	await new Promise(res => {
		if (doc.readyState === 'complete') return res();
		window.addEventListener('load', res);
	});
	await new Promise(res => window.setTimeout(res, 300));

	const check = (ok, what) => { console.log((ok ? '  ok   ' : '  FAIL ') + what); if (!ok) fail.push(CONFIG + ': ' + what); };
	const click = el => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
	const type = (el, value) => {
		el.value = value;
		el.dispatchEvent(new window.Event('input', { bubbles: true }));
	};

	doc.forms[0]['config'].value = fs.readFileSync(path.join(ROOT, CONFIG), 'utf8');
	doc.forms[0].dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
	const started = Date.now();
	while (doc.querySelector('#program .day-list') === null && Date.now() - started < 120000)
		await new Promise(res => window.setTimeout(res, 200));
	if (doc.querySelector('#program .day-list') === null) {
		check(false, 'a program was drawn');
		window.close();
		return;
	}
	const cfg = window.eval('config');
	const wb = window.eval('workbook');

	console.log('\n=== the four tabs ===');
	const tabs = [...doc.querySelectorAll('.sheet-tab')];
	check(tabs.length === 4, `${tabs.length} tabs`);
	check(tabs.map(t => t.dataset.sheet).join(',') === 'plan,pages,points,config',
		'plan, pages, points and configuration, in that order');
	check(tabs[0].classList.contains('is-open'), 'the plan opens first');
	const configPanel = doc.querySelector('.panel-config');
	check(tabs[0].parentNode.nextElementSibling === configPanel && configPanel.hidden === true,
		'the configuration is a separate hidden tab panel');
	check(doc.getElementById('sheet-plan').hidden === false, 'and its panel is the shown one');
	check(doc.getElementById('sheet-pages').hidden === true && doc.getElementById('sheet-points').hidden === true,
		'the other two are put away');
	click(tabs[3]);
	check(configPanel.hidden === false && doc.getElementById('sheet-plan').hidden === true,
		'clicking the fourth tab shows Configuration on its own');
	click(tabs[1]);
	check(doc.getElementById('sheet-pages').hidden === false && doc.getElementById('sheet-plan').hidden === true,
		'clicking a tab brings its panel out and puts the other away');
	check(tabs[1].getAttribute('aria-selected') === 'true' && tabs[0].getAttribute('aria-selected') === 'false',
		'and says which one is open');
	check(configPanel.hidden === true, 'and Configuration leaves the other tabs');
	check(window.getComputedStyle(doc.querySelector('.sheet-tabs')).position === 'sticky',
		'the strip of tabs stays in view however far down a sheet is read');
	check(window.getComputedStyle(doc.querySelector('.pages-bar')).position === 'sticky',
		'the selected-days print control stays visible while the sheets scroll');
	check(window.getComputedStyle(doc.getElementById('program')).overflow === 'visible',
		'and no overflow ancestor prevents it from sticking to the viewport');

	const dragStart = new window.Event('dragstart', { bubbles: true, cancelable: true });
	Object.defineProperty(dragStart, 'dataTransfer', { value: { effectAllowed: '', setData() {} } });
	tabs[0].dispatchEvent(dragStart);
	tabs[1].dispatchEvent(new window.MouseEvent('dragover', { bubbles: true, cancelable: true, clientX: 999 }));
	tabs[1].dispatchEvent(new window.Event('drop', { bubbles: true, cancelable: true }));
	tabs[0].dispatchEvent(new window.Event('dragend', { bubbles: true }));
	check([...doc.querySelectorAll('.sheet-tab')].map(tab => tab.dataset.sheet).join(',') === 'pages,plan,points,config',
		'dragging a tab changes its position');
	check(window.eval('appStorage').getItem('sheet-order') === '["pages","plan","points","config"]',
		'and the new order is remembered');

	console.log('\n=== the pages ===');
	// the days that hold a round, which are the ones worth handing out
	const wantDays = window.eval('window.currentProgram').filter(d => d.dzones.some(dz => dz.rounds.length));
	const cards = [...doc.querySelectorAll('.pages-day')];
	check(cards.length === wantDays.length, `${cards.length} day sheets for ${wantDays.length} days with rounds`);
	const fields = cfg.sports.reduce((n, s) => n + s.courts.length, 0);
	let rowBad = 0, roundBad = 0;
	// a zone is given the most rounds it ever holds, and never fewer than its
	// share of the four the template gives a day
	const rowsOf = {};
	cfg.zones.forEach(z => { rowsOf[z.rank] = 1; });
	window.eval('window.currentProgram').forEach(d => d.dzones.forEach(dz => {
		rowsOf[dz.zone.rank] = Math.max(rowsOf[dz.zone.rank] || 1, dz.rounds.length);
	}));
	if (4 % cfg.zones.length === 0)
		cfg.zones.forEach(z => { rowsOf[z.rank] = Math.max(rowsOf[z.rank], 4 / cfg.zones.length); });
	cards.forEach((card, i) => {
		const rounds = wantDays[i].dzones.reduce((n, dz) => n + rowsOf[dz.zone.rank], 0);
		if (card.querySelectorAll('tbody tr').length !== rounds * fields) rowBad++;
		// one round label per round, each standing beside all the fields of it
		const labels = [...card.querySelectorAll('.pages-round')];
		if (labels.length !== rounds) roundBad++;
		if (labels.some(l => l.rowSpan !== fields)) roundBad++;
	});
	check(rowBad === 0, `every day sheet has a row per field of every round (${fields} fields)`);
	check(roundBad === 0, 'and every round names itself once beside its own rows');
	// there is no row naming the sports here, so a field two sports share is named
	// by the sport it is being played for rather than twice by the field
	const cols = window.eval('workbook').cols;
	const wantFields = cols.map((col, i) =>
		cols.findIndex(other => other.court === col.court) === i ? col.court : col.sport.name);
	check(cards.every(card => {
		const names = [...card.querySelectorAll('.pages-field')].map(cell => cell.textContent);
		return names.length > 0 && names.length % wantFields.length === 0
			&& names.every((name, i) => name === wantFields[i % wantFields.length]);
	}), `every round names its fields ${wantFields.join(', ')}`);
	check(new Set(wantFields).size === wantFields.length,
		'and no two of them read the same');
	// the columns the upright rules stand between are all there to be ruled. that
	// they are ruled is read off the stylesheet above and not off the page: jsdom
	// resolves no var() into a computed style, and every rule of this sheet is
	// drawn in the measures its side declares.
	const upright = ['pages-home-id', 'pages-away-id', 'pages-home-score', 'pages-away-score', 'pages-ref'];
	check(cards.every(card => upright.every(kind => card.querySelector('.' + kind) !== null)),
		`every day sheet carries the ${upright.length} columns the upright rules stand between`);
	// the round name stands in the middle of its merged cell. `.pages-table th` is
	// the more particular of the two selectors, so naming the cell by its class
	// alone left the name set to the left by the rule that sets the rest of the
	// block to the left — which is worth asking the page about rather than the
	// stylesheet, none of it being written in var()
	const round_cell = doc.querySelector('#sheet-pages .pages-round');
	const round_style = window.getComputedStyle(round_cell);
	check(round_style.textAlign === 'center' && round_style.verticalAlign === 'middle',
		`the round name is centred in its merged cell (${round_style.textAlign}, ${round_style.verticalAlign})`);
	if (4 % cfg.zones.length === 0)
		check(cards.every(card => card.querySelectorAll('tbody tr').length === 4 * fields),
			'the Excel sheet keeps four ruled round blocks per printed day');
	check(cards.every(card => card.querySelectorAll('.pages-day-last').length === 1),
		'the final round meets the medium day frame without an extra double rule');
	// the merged round cell carries the bottom edge of its own block, since the
	// rules of the rows beside it stop at their own columns: one of the three
	// endings per round, and exactly one day ending per sheet
	check(cards.every(card => {
		const ends = [...card.querySelectorAll('.pages-round')];
		return ends.every(one => one.classList.contains('pages-round-end')
				|| one.classList.contains('pages-round-zone-end')
				|| one.classList.contains('pages-round-day-end'))
			&& card.querySelectorAll('.pages-round-day-end').length === 1
			&& card.querySelectorAll('.pages-round-zone-end').length === cfg.zones.length - 1;
	}), 'every round block closes itself: single between rounds, double between zones, the frame at the end');
	// the printed sheet names no columns, as the workbook did not
	check(cards.every(card => card.querySelector('thead') !== null),
		'the column names are there on screen and taken off by the print stylesheet');
	check(cards.every(card => card.querySelectorAll('colgroup col').length === 9),
		'every printed day keeps the nine column proportions of Excel C:K');
	check(cards.every(card => card.querySelector('.pages-date-screen') !== null
		&& card.querySelector('.pages-date-print') !== null),
		'every day carries its Greek screen date and its Excel-style print date');
	// the date is what picks the day, so the target is a line of writing rather
	// than a box the size of a full stop
	check(cards.every(card => {
		const label = card.querySelector('.pages-pick-label');
		return label !== null && label.contains(card.querySelector('.pages-pick'))
			&& label.contains(card.querySelector('.pages-date-screen'));
	}), 'and the whole of it picks the day for printing');
	check(/^[A-Z][a-z]+, [A-Z][a-z]+ \d{2}, \d{4}$/.test(cards[0].querySelector('.pages-date-print').textContent),
		'the printed date uses Excel long-date wording');
	const printCss = fs.readFileSync(path.join(ROOT, 'src/css/sheets.css'), 'utf8');
	// the block, the row and the type, measured off a page printed out of the real
	// workbook: 493.8 x 321.2 pt of 15.3 pt rows in 11.9 pt type
	check(/width:\s*174\.19mm/.test(printCss) && /height:\s*113\.4mm/.test(printCss)
		&& /height:\s*5\.4mm/.test(printCss) && /font-size:\s*11\.9pt/.test(printCss),
		'the paper uses the measured Excel block, row height and type size');
	// dotted between the fields of a round, solid between the rounds, double
	// between the zones, and the medium frame around the day. the three are
	// declared once and drawn in whichever measures the side asks for, so the
	// screen is ruled the same way as the paper.
	check(/border-bottom:\s*var\(--pages-rule-weight\) dotted var\(--pages-rule\)/.test(printCss)
		&& /border-bottom:\s*var\(--pages-rule-weight\) solid var\(--pages-rule-strong\)/.test(printCss)
		&& /border-bottom:\s*calc\(var\(--pages-rule-weight\) \* 3\) double var\(--pages-rule-strong\)/.test(printCss)
		&& /border:\s*0\.6mm solid #000/.test(printCss),
		'the dotted, single, double and frame rules of the workbook are all there');
	check(/--pages-row:\s*28px/.test(printCss) && /--pages-row:\s*5\.4mm/.test(printCss)
		&& /--pages-rule-weight:\s*0\.3mm/.test(printCss),
		'drawn a row at a time, 28px on the screen and 5.4mm on the paper');
	// down the block: dotted beside the round, solid beside the fields and the
	// referee, dotted between the two scores, and nothing between a number and
	// the name it belongs to
	check(/border-right:\s*var\(--pages-rule-weight\) dotted var\(--pages-rule\)/.test(printCss)
		&& /border-left:\s*var\(--pages-rule-weight\) solid var\(--pages-rule\)/.test(printCss)
		&& /border-left:\s*var\(--pages-rule-weight\) dotted var\(--pages-rule\)/.test(printCss)
		&& !/pages-home-team[^{]*{[^}]*border-right/s.test(printCss),
		'and the upright rules leave a team number joined to its name');
	// declared once, so the tab is ruled down as well as across
	check(!/is-printing[^{]*pages-home-id/.test(printCss),
		'and are the screen\u2019s rules as much as the paper\u2019s');
	// the round names its block from one merged cell with nothing drawn through it,
	// which is what makes the block read as one round. drawing the rules of the
	// rows across it was tried and is not worth it: what a browser makes of a
	// strip laid over a cell that spans rows is not a rule.
	check(!/pages-round::after/.test(printCss),
		'nothing is drawn through the merged round cell');
	// and the name stands in the middle of it rather than riding the baseline of
	// whatever line it happens to be on
	check(/pages-round-said[^{]*{[^}]*display:\s*inline-block/s.test(printCss)
		&& /pages-round-said[^{]*{[^}]*vertical-align:\s*middle/s.test(printCss)
		&& /\.pages-round\s*{[^}]*vertical-align:\s*middle/s.test(printCss)
		&& /\.pages-round\s*{[^}]*text-align:\s*center/s.test(printCss),
		'and the round name stands in the middle of it, both ways');
	check(/@page\s*{[^}]*margin:\s*0/s.test(printCss),
		'the A4 page reserves no browser header or footer margin');
	// the body is a page tall to begin with, and the first printed day carries a
	// margin that collapses up to it: a page of minimum height pushed down by that
	// margin is a second sheet of blank paper
	check(/body\.is-printing\s*{[^}]*min-height:\s*0/s.test(printCss),
		'and the page is not held open to a second, blank sheet');
	// the height of a printed day is its twenty one rows; counted the other way
	// round the frame is taken out of them and the last round comes out clipped
	check(/pages-day\.is-print[^{]*{[^}]*box-sizing:\s*content-box/s.test(printCss),
		'and the frame of a day is drawn around its rows rather than out of them');

	//the print marker makes explicit pairs: first+second on one A4, third on the
	//next one. the real print dialog is replaced here so the DOM can be read.
	window.print = () => {};
	window.eval('pages_print')(cards.slice(0, 3));
	check(cards[0].classList.contains('print-pair-first')
		&& cards[1].classList.contains('print-pair-last')
		&& cards[1].classList.contains('print-break')
		&& cards[2].classList.contains('print-pair-first')
		&& cards[2].classList.contains('print-pair-last'),
		'three picked days are marked as a two-day A4 pair followed by one day');
	window.dispatchEvent(new window.Event('afterprint'));

	// every match of the plan has a row of its own on the pages, and nothing else does
	const placed = window.eval('wb_placed()');
	const rows = [...doc.querySelectorAll('.pages-day tbody tr[data-key]')];
	check(rows.length === placed.length, `${rows.length} rows carry a match, for ${placed.length} on the plan`);
	const keys = rows.map(r => r.dataset.key).sort();
	check(keys.join('|') === placed.map(p => p.key).sort().join('|'), 'and they are the very slots the plan holds');
	check(rows.every(r => r.querySelectorAll('.pages-input').length === 3), 'each offering two scores and a referee');

	console.log('\n=== the score boxes take digits and are walked like a sheet ===');
	const scores = [...doc.querySelectorAll('#sheet-pages .pages-input[data-which="sh"], #sheet-pages .pages-input[data-which="sa"]')];
	check(scores.every(box => box.type === 'text' && box.getAttribute('inputmode') === 'numeric'),
		`all ${scores.length} score boxes are plain boxes with a number keypad and no arrows`);
	// anything that is not a digit is dropped, however it got in
	const dirty = scores[0];
	dirty.value = '1e-2x3';
	dirty.dispatchEvent(new window.Event('input', { bubbles: true }));
	check(dirty.value === '123', `only the digits are kept: 1e-2x3 became ${dirty.value}`);
	dirty.value = '';
	dirty.dispatchEvent(new window.Event('input', { bubbles: true }));
	// tab to the right, shift and tab to the left, return down to the next match
	const press = (el, key, shift) => el.dispatchEvent(new window.KeyboardEvent('keydown',
		{ key: key, shiftKey: shift === true, bubbles: true, cancelable: true }));
	const first = doc.querySelector('#sheet-pages .pages-input[data-which="sh"]');
	first.focus();
	press(first, 'Tab');
	check(doc.activeElement === first.closest('tr').querySelector('.pages-input[data-which="sa"]'),
		'tab moves to the score on the right');
	press(doc.activeElement, 'Tab', true);
	check(doc.activeElement === first, 'and shift and tab back to the one on the left');
	press(first, 'Enter');
	check(doc.activeElement === scores.filter(b => b.dataset.which === 'sh')[1],
		'return drops to the left score of the next match');
	// Tab still follows the scores, while arrows include all three columns.
	const ref = first.closest('tr').querySelector('.pages-input[data-which="ref"]');
	const awayBox = first.closest('tr').querySelector('.pages-input[data-which="sa"]');
	const nextRef = rows[1].querySelector('.pages-input[data-which="ref"]');
	first.focus();
	press(first, 'ArrowRight');
	check(doc.activeElement === awayBox, 'right arrow moves to the away score');
	press(awayBox, 'ArrowRight');
	check(doc.activeElement === ref, 'right arrow reaches the referee');
	press(ref, 'ArrowDown');
	check(doc.activeElement === nextRef, 'down arrow keeps the referee column');
	press(nextRef, 'ArrowUp');
	check(doc.activeElement === ref, 'up arrow returns to the previous referee');
	press(ref, 'ArrowLeft');
	check(doc.activeElement === awayBox, 'left arrow returns from the referee to the score');
	press(awayBox, 'ArrowDown');
	check(doc.activeElement === rows[1].querySelector('.pages-input[data-which="sa"]'), 'down arrow keeps the away-score column');
	first.focus();
	press(first, 'ArrowLeft');
	press(first, 'ArrowUp');
	check(doc.activeElement === first, 'arrows stop at the top and left edges');
	ref.focus();
	press(ref, 'ArrowRight');
	check(doc.activeElement === ref, 'right arrow stops at the referee column');
	check(press(ref, 'ArrowLeft', true), 'shift and arrows remain native text selection');
	check(doc.activeElement === ref, 'text selection does not change cells');
	const lastRef = rows.at(-1).querySelector('.pages-input[data-which="ref"]');
	lastRef.focus();
	press(lastRef, 'ArrowDown');
	check(doc.activeElement === lastRef, 'down arrow stops at the final match');
	const nextDay = rows.findIndex(r => r.closest('.pages-day') !== rows[0].closest('.pages-day'));
	if (nextDay > 0) {
		const before = rows[nextDay - 1].querySelector('.pages-input[data-which="ref"]');
		before.focus();
		press(before, 'ArrowDown');
		check(doc.activeElement === rows[nextDay].querySelector('.pages-input[data-which="ref"]'), 'vertical navigation continues across day boundaries');
	}
	ref.focus();
	press(ref, 'Enter');
	check(doc.activeElement === rows[1].querySelector('.pages-input[data-which="sh"]'), 'Enter from a referee also reaches the next left score');

	console.log('\n=== a score typed in ===');
	// a group match, since a knockout has nobody in it until one is played
	const row = rows.filter(r => {
		const game = window.eval('wb_at')(r.dataset.key);
		return game.kn === null;
	})[0];
	const game = window.eval('wb_at')(row.dataset.key);
	const group = cfg.groups[game.id];
	type(row.querySelector('.pages-input[data-which="sh"]'), '3');
	type(row.querySelector('.pages-input[data-which="sa"]'), '1');
	type(row.querySelector('.pages-input[data-which="ref"]'), 'Δοκιμή');
	const kept = window.eval('wb_result')(game);
	check(kept.sh === 3 && kept.sa === 1 && kept.ref === 'Δοκιμή', 'the score and the referee reach the workbook');
	check(row.classList.contains('pages-played'), 'and the row says the match has been played');
	check(window.eval('wb_played')(game) === true, 'and the match counts as played');

	console.log('\n=== the points follow ===');
	const stand = window.eval('wb_standings')(group);
	const home = stand.filter(r => r.team.id === game.home)[0];
	const away = stand.filter(r => r.team.id === game.away)[0];
	const points = group.sport.points_fn(3, 1);
	check(home.pld === 1 && home.w === 1 && home.l === 0 && home.gf === 3 && home.ga === 1 && home.gd === 2,
		`the winner reads 1 played, 1 won, 3-1 (${group.sport.name})`);
	check(away.pld === 1 && away.w === 0 && away.l === 1 && away.gf === 1 && away.ga === 3 && away.gd === -2,
		'and the loser the other way round');
	check(home.pts === points[0] && away.pts === points[1],
		`worth ${points[0]} and ${points[1]}, which is what ${group.sport.name} pays`);
	check(stand.filter(r => r.pld === 0).every(r => r.pts === 0), 'and a team that has not played has nothing');
	check(stand[0].rnk === 1 && stand.every(r => r.rnk === 1 + stand.filter(o => o.pts > r.pts).length),
		'the rank is the one RANK.EQ gives: level on points is a place shared');

	// the table on the page says the same
	click(tabs[2]);
	// the standings are read from across a table by whoever reads them out, so
	// they are not set as small as the rest of the page
	const pointsSize = parseFloat(window.getComputedStyle(doc.querySelector('#sheet-points .points-table')).fontSize);
	check(pointsSize >= 16, `the points tables are set at ${pointsSize}px`);
	const table = [...doc.querySelectorAll('.points-group')]
		.filter(box => box.querySelector('.points-group-name').textContent === group.id)[0];
	check(table !== undefined, `the ${group.id} standings are on the page`);
	if (table !== undefined) {
		const head = [...table.querySelectorAll('thead th')].map(th => th.textContent);
		check(head[0] === 'id' && head[1] === 'team', 'team ID column has its own id heading');
		const draws = window.eval('wb_has_draw')(group.sport);
		check(head.includes('PLD') && head.includes('PTS') && head.includes('RNK'), 'with the columns of the template');
		check(head[head.indexOf('RNK') + 1] === 'FRNK', 'unique final rank is immediately after the shared points rank');
		check([...table.querySelectorAll('.points-frnk')].every((cell, i) => cell.textContent === String(i + 1)),
			'FRNK is unique');
		check([...table.querySelectorAll('.points-frnk[data-tooltip]')].every(cell =>
			!cell.dataset.tooltip.includes('Παράλειψη') && !cell.dataset.tooltip.includes('Βαθμοί')),
			'FRNK explanations contain only tie-breakers that actually separated teams');
		check(head.includes('D') === draws,
			draws ? `${group.sport.name} can be drawn, so it has a D column` : `${group.sport.name} cannot be drawn, so it has no D column`);
		const first = table.querySelector('tbody tr');
		check(first.querySelector('.points-team').textContent === stand[0].team.name, 'the top of the table first');
		check(first.querySelector('.points-pts').textContent === String(stand[0].pts), 'and its points beside it');
	}
	check(doc.querySelector('.points-legend') === null, 'there is no separate symbol explanation block');
	check([...doc.querySelectorAll('.points-table thead tr')].every(row => row.firstElementChild.textContent === 'id'),
		'id heading appears in both sport groups and overall standings');
	check([...doc.querySelectorAll('.points-rnk[title]')].every(cell =>
		!window.getComputedStyle(cell).textDecoration.includes('underline')), 'tied RNK numbers have no dotted underline');
	check([...doc.querySelectorAll('.points-table thead th[data-tooltip]')]
		.some(th => th.textContent === 'PLD' && th.dataset.tooltip === 'Αγώνες' && th.title === ''),
		'hovering a standings symbol shows its own visible explanation');

	console.log('\n=== completed groups fill the knockouts ===');
	const direct = Object.values(cfg.knockouts).find(kn => kn.home.type === 'group'
		&& kn.away.type === 'group' && kn.home.group.id === kn.away.group.id);
	if (direct === undefined) {
		check(true, 'no direct group-to-knockout match in this configuration, skipped');
	} else {
		const targetGroup = direct.home.group;
		const knockoutGame = window.eval('wb_knockout_game')(direct.id);
		check(window.eval('wb_group_complete')(targetGroup) === false
			&& window.eval('wb_sides')(knockoutGame).home === null,
			'a partial group does not prematurely fill its knockout place');
		window.eval('wb_placed')().filter(p => p.game.kn === null && p.game.id === targetGroup.id)
			.forEach(p => window.eval('wb_set_result')(p.game, 1, 0, ''));
		window.eval('wb_recount')();
		window.eval('pages_refresh_knockouts')();
		window.eval('plan_refresh_knockouts')();
		const sides = window.eval('wb_sides')(knockoutGame);
		const label = window.eval('wb_plan_label')(knockoutGame);
		check(window.eval('wb_group_complete')(targetGroup) === true && sides.home !== null && sides.away !== null,
			'all group results automatically fill both knockout sides');
		check(/^[0-9A-Z][sfb][0-9A-Z]$/.test(label), `the plan shows the resolved stage label ${label}`);
		check(Object.keys(cfg.knockouts).some(id => window.eval('wb_knockout_stage')(id) === 'f'),
			'the final uses the f marker');
		if (Object.keys(cfg.knockouts).length > 3)
			check(Object.keys(cfg.knockouts).some(id => window.eval('wb_knockout_stage')(id) === 'b'),
				'an earlier playoff or barrage uses the b marker');
	}

	console.log('\n=== changing the plan ===');
	click(tabs[0]);
	check(configPanel.hidden === true, 'returning to Program keeps Configuration in its own tab');
	const from = doc.querySelector('#sheet-plan td.cell-match');
	const fromKey = from.dataset.key;
	const fromText = from.textContent;
	// a free slot of the same round, so the move is one the plan can show. a
	// field two sports share has a column for each of them but is one slot, so
	// the one that is taken carries no key at all and cannot be picked here.
	const empty = [...doc.querySelectorAll('#sheet-plan td.cell-empty[data-key]')]
		.filter(td => td.dataset.key.split('|').slice(0, 3).join('|') === fromKey.split('|').slice(0, 3).join('|'))
		.filter(td => window.eval('wb_at')(td.dataset.key) === null)[0];
	if (empty === undefined) {
		check(true, 'no empty slot in that round to move into, skipped');
	} else {
		const toKey = empty.dataset.key;
		window.eval('wb_move')(fromKey, toKey);
		window.eval('sheets_draw')();
		const moved = doc.querySelector(`#sheet-plan td[data-key="${toKey}"]`);
		const left = doc.querySelector(`#sheet-plan td[data-key="${fromKey}"]`);
		check(moved.classList.contains('cell-match') && moved.textContent === fromText, 'the match is drawn where it was moved to');
		check(left.classList.contains('cell-empty') && left.textContent === '·', 'and the slot it left is empty');
		check([...doc.querySelectorAll('#sheet-plan td.cell-match')].length === placed.length, 'and no match was lost on the way');
		// the pages follow the plan
		check(doc.querySelector(`.pages-day tr[data-key="${toKey}"]`) !== null
			&& doc.querySelector(`.pages-day tr[data-key="${fromKey}"]`) === null,
			'and the printed sheet moves it too');
		window.eval('wb_move')(toKey, fromKey);
		window.eval('sheets_draw')();
	}

	// the editor over a cell
	const cell = doc.querySelector('#sheet-plan td.cell-match');
	click(cell);
	const editor = doc.querySelector('.plan-editor');
	check(editor !== null, 'clicking a slot opens the editor');
	if (editor !== null) {
		const selects = [...editor.querySelectorAll('select')];
		check(selects.length === 3, 'offering the match and its two teams');
		check(selects[1].options.length === cfg.teams.length, `every one of the ${cfg.teams.length} teams to choose from`);
		const was = window.eval('wb_at')(cell.dataset.key);
		// give the slot the other two teams of its group
		const other = cfg.groups[was.id] ? cfg.groups[was.id].teams.filter(t => t.id !== was.home && t.id !== was.away) : [];
		if (other.length >= 2) {
			selects[1].value = String(other[0].id);
			selects[2].value = String(other[1].id);
			click([...editor.querySelectorAll('button')].filter(b => b.textContent === 'Εφαρμογή')[0]);
			const now = window.eval('wb_at')(cell.dataset.key);
			check(now.home === other[0].id && now.away === other[1].id, 'and applying it changes who plays');
			check(doc.querySelector(`#sheet-plan td[data-key="${cell.dataset.key}"]`).textContent === other[0].id + '-' + other[1].id,
				'which the plan draws straight away');
			check(doc.querySelector('.plan-editor') === null, 'and the editor puts itself away');
		}
	}

	console.log('\n=== a slot that does not hold is said so, not refused ===');
	// the two teams of one slot put into another slot of the same round
	const round = doc.querySelector('#sheet-plan td.cell-match').dataset.key.split('|').slice(0, 3).join('|');
	const together = [...doc.querySelectorAll('#sheet-plan td.cell-match')]
		.filter(td => td.dataset.key.indexOf(round + '|') === 0);
	if (together.length >= 2) {
		const one = window.eval('wb_at')(together[0].dataset.key);
		window.eval('wb_set_teams')(together[1].dataset.key, one.home, one.away);
		window.eval('sheets_draw')();
		const marked = doc.querySelector(`#sheet-plan td[data-key="${together[1].dataset.key}"]`);
		check(marked.classList.contains('cell-wrong'), 'a team playing twice in one round is marked');
		check(/παίζει ήδη/.test(marked.dataset.wrong), 'and the cell carries what is wrong with it');
		// hovering it opens the panel that reads the broken rules out in full
		marked.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
		const panel = doc.querySelector('.plan-warning');
		check(panel !== null && /παίζει ήδη/.test(panel.textContent),
			'and hovering it opens a panel that says which rule is broken');
		check(panel !== null && /Παραβίαση κανόνα/.test(panel.querySelector('.plan-warning-head').textContent),
			'headed Παραβίαση κανόνα');
		// each rule is a sentence of its own, so each one opens with a capital
		check(panel !== null && [...panel.querySelectorAll('.plan-warning-list li')]
			.every(li => li.textContent[0] === li.textContent[0].toLocaleUpperCase('el')),
			'and every rule under a bullet starts as a sentence does');
		// the panel reads out both of what a slot is told: what cannot stand under
		// Παραβίαση κανόνα, and what is worth a second look under Συνιστάται προσοχή
		const lines = key => (marked.dataset[key] || '').split('\n').filter(one => one.length);
		check(panel !== null && panel.querySelectorAll('.plan-warning-list li').length
			=== lines('wrong').length + lines('caution').length,
			`with one line per rule (${lines('wrong').length} broken, ${lines('caution').length} worth a look)`);
		check(panel !== null && /Παραβίαση κανόνα/.test(panel.querySelector('.plan-warning-wrong').textContent),
			'the ones that cannot stand under their own red heading');
		check(panel === null || lines('caution').length === 0
			|| /Συνιστάται προσοχή/.test(panel.querySelector('.plan-warning-caution').textContent),
			'and the rest under Συνιστάται προσοχή');
		// and the editor of that slot says the same where the change is made
		window.eval('plan_editor')(marked);
		const editor = doc.querySelector('.plan-editor-wrong');
		check(editor !== null && /παίζει ήδη/.test(editor.textContent),
			'and the editor of the slot says it too');
		window.eval('plan_close')();
	} else {
		check(true, 'only one match in that round, skipped');
	}

	console.log('\n=== what is handed out carries it ===');
	check(doc.getElementById('excel').disabled === false, 'the workbook is still there to be built');

	console.log('\n=== the championship handed to somebody else ===');
	const link = await window.eval('share_link')(doc.forms[0]['config'].value);
	check(link.indexOf('#p=') !== -1, `a link carries the whole of it in itself (${link.length} characters)`);
	// the button says so, and puts it where it can be copied
	click(doc.getElementById('share'));
	for (let i = 0; i < 100 && !doc.querySelector('.share-line'); i++)
		await new Promise(resolve => window.setTimeout(resolve, 10));
	const line = doc.querySelector('.share-line');
	check(line !== null && line.querySelector('.share-link').value.indexOf('#p=') !== -1,
		'and the button lays it out to be copied');
	await shared(port, link, Object.keys(window.eval('workbook').slots).sort().join('|'), check);
	share_close_line(doc);

	console.log('\n=== the championship a previous visit left ===');
	// the whole of it, driven the way the camp meets it: what this visit leaves in
	// the browser is carried into a second one, and the second one is a page
	// opened from scratch — not these functions called by hand
	const before = Object.keys(window.eval('workbook').slots).sort().join('|');
	const left_behind = {};
	for (let i = 0; i < window.localStorage.length; i++) {
		const key = window.localStorage.key(i);
		left_behind[key] = window.localStorage.getItem(key);
	}
	const prefix = window.eval('STORAGE_PREFIX');
	check(left_behind[prefix + 'workbook'] !== undefined && left_behind[prefix + 'config'] !== undefined,
		'the visit leaves the championship and its configuration in the browser');
	// the panel is folded away by the time a program is drawn, and the camp may
	// have folded it itself, so the second visit opens with it folded
	left_behind[prefix + 'panel'] = 'collapsed';
	await second(port, left_behind, before, check);

	console.log('\n=== submitting again asks before it throws the program away ===');
	// the asking hangs off the button, since it is the camp being about to lose a
	// morning of work that is worth stopping
	const submit = doc.forms[0].querySelector('button[type="submit"]');
	click(submit);
	const ask = doc.querySelector('.ui-ask');
	check(ask !== null, 'a dialogue stands in the way of a second submit');
	check(ask !== null && /χαθεί/.test(ask.textContent), 'saying the program will be lost');
	check(doc.querySelector('.day-list') !== null, 'and the program is still on the page while it is up');
	// saying no leaves everything as it was
	[...ask.querySelectorAll('button')].find(b => b.textContent === 'Ακύρωση').dispatchEvent(
		new window.MouseEvent('click', { bubbles: true }));
	check(doc.querySelector('.ui-ask') === null && doc.querySelector('.day-list') !== null,
		'saying no puts the dialogue away and keeps the program');
	// and saying yes starts the search over, which takes the program off the page
	click(submit);
	[...doc.querySelector('.ui-ask').querySelectorAll('button')]
		.find(b => b.textContent === 'Νέα αναζήτηση')
		.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
	check(doc.querySelector('.ui-ask') === null && doc.querySelector('.day-list') === null,
		'and saying yes starts over');

	if (noise.length)
		console.log('\nNOISE:\n' + noise.slice(0, 20).join('\n'));
	window.close();
}

//the line the share button lays out is a thing of this page, not of the next
function share_close_line(doc) {
	const open = doc.querySelector('.share-line');
	if (open !== null) open.remove();
}

(async () => {
	await new Promise(res => server.listen(0, '127.0.0.1', res));
	const fail = [];
	for (const config of CONFIGS) {
		console.log('\n########## ' + config + ' ##########');
		await run(config, fail);
	}
	console.log(fail.length ? `\n${fail.length} FAILED\n  ` + fail.join('\n  ') : '\nall checks passed');
	server.close();
	process.exit(fail.length ? 1 : 0);
})();
