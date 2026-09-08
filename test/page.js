// loads the real page in jsdom over a real http origin, runs the real scripts,
// submits a real config and reads back the tree the displayer drew
const fs = require('fs');
const path = require('path');
const http = require('http');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
// every input the repository carries, plus the odd shapes kept beside this file
const CONFIGS = process.argv.length > 2 ? process.argv.slice(2)
	: fs.readdirSync(path.join(ROOT, 'examples')).filter(f => /^input.*\.txt$/.test(f)).map(f => 'examples/' + f)
		.concat(fs.readdirSync(path.join(__dirname, 'configs')).map(f => 'test/configs/' + f));

// jsdom does not give a form the named properties a browser gives it, and
// parser.js reads form['config'], so the page is served with that one browser
// behaviour put back. nothing else about the page is changed.
const SHIM = `<script>
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
		// the shim goes in front of the first fetched script, which is the first
		// thing to read the form. the name may carry a version, so it is matched
		// rather than spelt out.
		body = Buffer.from(body.toString('utf8').replace(/(?=<script src="src\/js\/common\.js)/, SHIM), 'utf8');
	res.writeHead(200, { 'Content-Type': (TYPES[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8' });
	res.end(body);
});

const vc = new VirtualConsole();
const noise = [];
vc.on('jsdomError', e => noise.push('jsdomError: ' + e.message));
vc.on('error', (...a) => noise.push('console.error: ' + a.join(' ')));

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

	console.log('=== wiring ===');
	check(typeof window.displayer === 'function', 'displayer.js ran');
	check(typeof window.ScheduleMatchesDefault === 'function', 'scheduling_algorithms.js ran');
	check(typeof window.ui_theme === 'function', 'ui.js ran');
	check(window.JSZip !== undefined, 'jszip ran');
	check(doc.forms.length === 1, 'exactly one form');
	check(doc.forms[0]['config'] && doc.forms[0]['config'].tagName === 'TEXTAREA', "form['config'] is the textarea");
	check(doc.getElementById('excel').disabled === true, 'excel starts disabled');
	check(doc.getElementById('search').hidden === true, 'status starts hidden');
	// every stylesheet the page links has to parse; the number of them is the
	// page's business and not this check's
	const linked = doc.querySelectorAll('link[rel="stylesheet"]').length;
	check(doc.styleSheets.length === linked, `all ${linked} stylesheets parsed`);

	console.log('\n=== save and load still work ===');
	doc.forms[0]['config'].value = 'ΔΟΚΙΜΗ';
	click(doc.getElementById('save'));
	check(window.eval('appStorage').getItem('config') === 'ΔΟΚΙΜΗ', 'save writes the config');
	doc.forms[0]['config'].value = '';
	click(doc.getElementById('load'));
	check(doc.forms[0]['config'].value === 'ΔΟΚΙΜΗ', 'load reads it back');

	console.log('\n=== the blue rectangle is gone ===');
	check(doc.querySelector('.topbar-mark') === null, 'no decorative mark in the top bar');
	check(doc.querySelector('.required') === null, 'no red asterisk beside the heading');

	console.log('\n=== theme slider ===');
	const themeBtn = doc.getElementById('theme');
	check(themeBtn.getAttribute('role') === 'switch', 'it is a switch');
	check(themeBtn.querySelector('.switch-knob') !== null && themeBtn.querySelector('.switch-track') !== null,
		'drawn as a track with a knob');
	const before = window.ui_theme();
	check(themeBtn.getAttribute('aria-checked') === (before === 'dark' ? 'true' : 'false'),
		`the knob starts on the ${before} side`);
	click(themeBtn);
	const after = doc.documentElement.getAttribute('data-theme');
	check(after !== before && (after === 'dark' || after === 'light'), `toggles ${before} -> ${after}`);
	check(themeBtn.getAttribute('aria-checked') === (after === 'dark' ? 'true' : 'false'), 'and the knob follows');
	check(window.eval('appStorage').getItem('theme') === after, 'the choice is kept');
	click(themeBtn);
	check(doc.documentElement.getAttribute('data-theme') === before, 'toggles back');
	check(themeBtn.getAttribute('aria-checked') === (before === 'dark' ? 'true' : 'false'), 'and so does the knob');

	console.log('\n=== collapse toggle ===');
	const panel = doc.querySelector('.panel-config');
	const collapseBtn = doc.getElementById('collapse');
	check(collapseBtn.classList.contains('toggle'), 'it is the square toggle');
	check(collapseBtn.textContent.trim() === '', 'it carries no wording');
	check(collapseBtn.closest('.panel-head').querySelector('h2').nextElementSibling === collapseBtn,
		'it sits right beside Διαμόρφωση');
	check(!panel.classList.contains('is-collapsed'), 'starts open');
	click(collapseBtn);
	check(panel.classList.contains('is-collapsed') && collapseBtn.getAttribute('aria-expanded') === 'false', 'presses down');
	check(/Ανάπτυξη/.test(collapseBtn.title), 'and says how to undo it');
	click(collapseBtn);
	check(!panel.classList.contains('is-collapsed') && collapseBtn.getAttribute('aria-expanded') === 'true', 'comes back up');
	window.eval('appStorage').removeItem('panel');

	// a browser that has never run this configuration has nothing to be offered
	check(doc.querySelector('.saved-offer') === null, 'a first visit is offered no saved championship');

	console.log('\n=== submit ===');
	doc.forms[0]['config'].value = fs.readFileSync(path.join(ROOT, CONFIG), 'utf8');
	// search_start draws the line and only then hands the browser the first
	// window, so this is read with nothing awaited in between: a search that ends
	// inside a single tick would otherwise be over before it could be seen
	doc.forms[0].dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
	check(doc.getElementById('search').hidden === false, 'the status shows itself');
	check(doc.getElementById('search').classList.contains('is-busy'), 'and is marked busy');
	check(doc.getElementById('stop').hidden === false, 'the stop is offered');

	const started = Date.now();
	while (doc.querySelector('#program .day-list') === null && Date.now() - started < 120000)
		await new Promise(res => window.setTimeout(res, 200));
	const box = doc.getElementById('search');
	console.log('  status: ' + doc.getElementById('search-status').textContent);
	console.log('  classes: ' + box.className);
	const list = doc.querySelector('#program .day-list');
	check(list !== null, `a program was drawn (${Math.round((Date.now() - started) / 1000)}s)`);
	if (list === null) {
		// no program means nothing after this can be read; the next configuration
		// still gets its turn
		console.log('\nNOISE:\n' + noise.join('\n'));
		window.close();
		return;
	}
	check(box.classList.contains('is-ok'), 'the status is marked as found');
	check(doc.getElementById('stop').hidden === true, 'the stop is gone');
	check(doc.getElementById('excel').disabled === false, 'excel is enabled');
	check(panel.classList.contains('is-collapsed'), 'the config folded away on its own');
	check(window.eval('appStorage').getItem('panel') !== 'collapsed', 'a fold it did on its own is not kept');

	console.log('\n=== the grid ===');
	// common.js declares config with const, so it is a lexical global and not a
	// property of the window
	const cfg = window.eval('config');
	const sports = cfg.sports;
	const cols = [];
	sports.forEach(s => s.courts.forEach(c => cols.push({ sport: s.name, court: c })));
	check(list.style.getPropertyValue('--cols') === '', 'no fixed column count is set any more');
	check(list.querySelectorAll('.day-grid').length === 1, 'one day grid');
	const dayGridStyle = window.getComputedStyle(list.querySelector('.day-grid'));
	check(dayGridStyle.display === 'flex' && dayGridStyle.flexWrap === 'wrap',
		'the plan wraps as many intrinsic-width day cards as the screen can hold');
	check(dayGridStyle.justifyContent === 'center', 'each row of day cards is centred in the plan');
	check(doc.body.dataset.sheet === 'plan', 'the open plan receives its wider page canvas');
	check(list.querySelectorAll('.program-bar').length === 1, 'one editing toolbar');
	check(list.querySelector('.legend') === null, 'sport legend is removed from the toolbar');
	check(list.querySelector('#plan-undo') !== null && list.querySelector('#plan-redo') !== null,
		'undo and redo remain available');
	console.log('  counts: ' + list.querySelector('.program-counts').textContent);

	const days = [...list.querySelectorAll('.day')];
	const named = cfg.zones.length !== 1 || cfg.zones[0].name !== null;
	const labelCols = named ? 2 : 1;

	// the calendar the page should be drawing, worked out here on its own: every
	// date from the first to the last, the ones the configuration passes over
	// carrying no zone of their own
	const DAY_MS = 24 * 60 * 60 * 1000;
	const prog = window.currentProgram;
	const byDate = {};
	prog.forEach(d => { byDate[d.date.getTime()] = d; });
	const wantDays = [];
	for (let t = prog[0].date.getTime(); t <= prog[prog.length - 1].date.getTime(); t += DAY_MS)
		wantDays.push(byDate[t] ? { day: byDate[t], blank: false } : { day: { date: new Date(t) }, blank: true });
	// and how many rows a zone is given on every day: the most it ever holds, and
	// never fewer than its share of the four rounds the template gives a day,
	// since those are times the camp has whether or not the configuration used them
	const rowsOf = {};
	cfg.zones.forEach(z => { rowsOf[z.rank] = 1; });
	prog.forEach(d => d.dzones.forEach(dz => {
		rowsOf[dz.zone.rank] = Math.max(rowsOf[dz.zone.rank] || 1, dz.rounds.length);
	}));
	if (4 % cfg.zones.length === 0)
		cfg.zones.forEach(z => { rowsOf[z.rank] = Math.max(rowsOf[z.rank], 4 / cfg.zones.length); });
	// the rounds a zone of a day should be drawing, in the order they are read in:
	// the ones the configuration gives and the rest of the band beside them. on the
	// arrival morning the ones that are held are the last of the band.
	const roundsOf = (dz, arrival) => {
		const capacity = rowsOf[dz.zone.rank];
		const given = dz.rounds;
		const offset = arrival && given.length < capacity ? capacity - given.length : 0;
		const out = [];
		for (let row = 0; row < capacity; row++) {
			const at = row - offset;
			out.push(at >= 0 && at < given.length ? given[at] : null);
		}
		return out;
	};

	const gaps = wantDays.filter(d => d.blank).length;
	check(days.length === wantDays.length,
		`${days.length} day cards: ${prog.length} given and ${gaps} passed over, first to last`);
	check(list.querySelectorAll('.day-blank').length === gaps, `${gaps} of them drawn as empty days`);

	let headBad = 0, rowBad = 0, spanBad = 0, dateBad = 0, cornerBad = 0, zoneBad = 0, cutBad = 0;
	days.forEach((day, i) => {
		const table = day.querySelector('table.day-table');
		if (table === null) { headBad++; return; }

		// the two corners name what the two header rows are
		const corners = [...table.querySelectorAll('thead .corner')];
		if (corners.length !== 2) cornerBad++;
		if (corners[0].textContent !== 'Άθλημα' || corners[1].textContent !== 'Γήπεδο') cornerBad++;
		if (corners.some(c => c.colSpan !== labelCols)) cornerBad++;

		const courtCells = [...table.querySelectorAll('.cell-head')];
		if (courtCells.length !== cols.length) headBad++;
		courtCells.forEach((c, j) => {
			if (c.textContent !== cols[j].court) headBad++;
			if (c.dataset.sportIndex !== String(sports.findIndex(s => s.name === cols[j].sport))) headBad++;
			// nothing may be clipped: no ellipsis and no width of its own
			const style = window.getComputedStyle(c);
			if (style.textOverflow === 'ellipsis' || style.overflow === 'hidden') cutBad++;
			if (c.style.width || c.style.maxWidth) cutBad++;
		});

		let total = labelCols;
		[...table.querySelectorAll('.head-sport')].forEach(s => {
			total += s.colSpan;
			const sport = sports.find(x => x.name === s.textContent);
			if (!sport || sport.courts.length !== s.colSpan) spanBad++;
			if (s.style.gridColumn) spanBad++;   // the old grid span must be gone
		});
		// every header row must add up to the same number of columns
		const headerWidth = [...table.querySelectorAll('thead tr')]
			.map(tr => [...tr.children].reduce((n, c) => n + c.colSpan, 0));
		if (headerWidth[0] !== total || headerWidth[1] !== total) spanBad++;

		// every zone is a body of its own now, whether or not it holds a round, and
		// its name stands beside all its rows
		const bodies = [...table.querySelectorAll('tbody.zone')];
		const zones = wantDays[i].blank
			? cfg.zones.map(z => ({ zone: z, rounds: [] }))
			: wantDays[i].day.dzones;
		if (bodies.length !== zones.length) zoneBad++;
		bodies.forEach((body, z) => {
			const rows = [...body.querySelectorAll('tr')];
			const wanted = roundsOf(zones[z], i === 0 && z === 0);
			if (rows.length !== wanted.length) zoneBad++;
			// a round the configuration did not ask for is marked as one, but it is a
			// round like any other: numbered, and every cell of it a place a match
			// can be put
			rows.forEach((r, ri) => {
				if (r.classList.contains('round-extra') !== (wanted[ri] === null)) zoneBad++;
				if (!/^Γ\d+$/.test(r.querySelector('.round-rank').textContent)) zoneBad++;
				// every cell is a place a match can be put, bar the second column of a
				// field two sports share, which is the same field already taken
				if ([...r.querySelectorAll('td.cell')].some(td =>
					td.dataset.key === undefined && !td.classList.contains('cell-taken'))) zoneBad++;
			});
			const label = body.querySelector('.zone-name');
			if (named) {
				if (label === null || label.rowSpan !== rows.length) zoneBad++;
				if (label !== null && label.textContent !== zones[z].zone.name) zoneBad++;
			} else if (label !== null) {
				zoneBad++;
			}
			// every round row must total the same width as the header
			rows.forEach(tr => {
				if ([...tr.children].reduce((n, c) => n + c.colSpan, 0) + (tr === rows[0] || !named ? 0 : 1) !== total)
					rowBad++;
				if (tr.querySelectorAll('td.cell').length !== cols.length) rowBad++;
			});
		});

		if (!day.querySelector('.day-weekday').textContent || !day.querySelector('.day-full').textContent)
			dateBad++;
		if (!day.querySelector('.day-full').textContent.includes(String(wantDays[i].day.date.getUTCFullYear())))
			dateBad++;
		if (day.classList.contains('day-blank') !== wantDays[i].blank) dateBad++;
	});
	check(cornerBad === 0, 'every card labels its two header rows Άθλημα and Γήπεδο');
	check(headBad === 0, 'every card names its fields in the right order');
	check(cutBad === 0, 'no field name is set up to be clipped');
	check(spanBad === 0, 'every sport spans exactly its own fields and every row is the same width');
	check(zoneBad === 0, 'every zone is a body of its own with its name beside all its rounds');
	check(rowBad === 0, 'every round row has one cell per field');
	check(dateBad === 0, 'every card carries its weekday and its full date');
	console.log('  first card: ' + days[0].querySelector('.day-weekday').textContent + ' / ' + days[0].querySelector('.day-full').textContent);

	// the cells must hold what the scheduler placed, in the same places
	let placed = 0;
	prog.forEach(day => day.dzones.forEach(dz => dz.rounds.forEach(r =>
		Object.values(r.slots).forEach(s => { if (s.match) placed++; }))));
	const cells = [...list.querySelectorAll('.cell-match')];
	let bad = 0;
	cells.forEach(c => {
		if (!c.textContent.trim() || !c.title || c.dataset.sportIndex === undefined) bad++;
	});
	check(cells.length === placed, `${cells.length} match cells for ${placed} placed matches`);
	check(bad === 0, 'every match cell carries its text, its colour and its tooltip');
	// a cell that is told something carries a ring of its own colour, so the old
	// bar is looked for only on the cells that are told nothing
	const plain = cells.filter(c => !c.classList.contains('cell-wrong') && !c.classList.contains('cell-caution'));
	check(plain.every(c => window.getComputedStyle(c).boxShadow === 'none' || !window.getComputedStyle(c).boxShadow),
		`and no coloured bar down the left side of the ${plain.length} that are told nothing`);
	const empties = [...list.querySelectorAll('.cell-empty')];
	check(empties.length > 0 && empties.every(c => c.textContent === '·'), `${empties.length} empty cells are muted dots`);
	const ranks = [...list.querySelectorAll('.round-rank')];
	check(ranks.length > 0 && ranks.every(r => /^Γ\d+$/.test(r.textContent)),
		`all ${ranks.length} rounds are numbered`);
	// every round of every day can be dragged into and opened, the ones the
	// configuration left out included
	const extra = [...list.querySelectorAll('tr.round-extra')];
	check(extra.length === 0 || extra.every(r => [...r.querySelectorAll('td.cell')].every(td => td.dataset.key !== undefined)),
		`${extra.length} rounds the configuration did not ask for are there to be used`);

	// the numbers themselves, read straight off the program — every card, whether
	// the configuration gave the day or the page filled it in
	let wrong = 0, checked = 0, blankChecked = 0;
	wantDays.forEach((want, di) => {
		const rows = [...days[di].querySelectorAll('tbody.zone > tr')];
		let ri = 0;
		const zones = want.blank ? cfg.zones.map(z => ({ zone: z, rounds: [] })) : want.day.dzones;
		zones.forEach((dz, zi) => {
			const rounds = roundsOf(dz, di === 0 && zi === 0);
			rounds.forEach(round => {
				const tds = [...rows[ri++].querySelectorAll('td.cell')];
				cols.forEach((col, ci) => {
					const slot = round && round.slots[col.court];
					const m = slot && slot.match;
					let wanted = '·';
					if (m && m.sport.name === col.sport) {
						const game = window.eval('wb_at')(tds[ci].dataset.key);
						wanted = window.eval('wb_plan_label')(game);
					}
					if (round === null) blankChecked++; else checked++;
					if (tds[ci].textContent !== String(wanted)) wrong++;
				});
			});
		});
		if (ri !== rows.length) wrong++;
	});
	check(wrong === 0, `all ${checked} cells of the rounds the configuration gave hold what the scheduler placed, and all ${blankChecked} cells of the rounds it did not are empty`);

	check(list.classList.contains('no-zone-names') === false, 'the old no-zone-names class is gone');
	check(named
		? list.querySelectorAll('.zone-name').length === list.querySelectorAll('tbody.zone').length
		: list.querySelectorAll('.zone-name').length === 0,
		named ? 'zones are named, so every one carries its label' : 'no zone names, so no label column at all');

	console.log('\n=== resubmit clears, stop stops ===');
	// again with nothing awaited, so that the state between the two is the one
	// being read and not whatever the next search has already got to. a submit
	// with a program on the page is stopped and asked about first, so the asking
	// is answered the way the camp answers it.
	doc.forms[0].dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
	const ask = doc.querySelector('.ui-ask');
	check(ask !== null && doc.querySelector('.day-list') !== null,
		'a submit over a program is asked about before anything is lost');
	if (ask !== null)
		[...ask.querySelectorAll('button')].find(b => b.textContent === 'Νέα αναζήτηση')
			.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
	check(doc.querySelector('.day-list') === null, 'the old program is taken off the page');
	check(doc.getElementById('excel').disabled === true, 'and so is its download');
	click(doc.getElementById('stop'));
	console.log('  status: ' + doc.getElementById('search-status').textContent);
	check(doc.getElementById('search').classList.contains('is-stopped'), 'stopping is marked as stopped');
	check(doc.getElementById('stop').hidden === true, 'and the stop puts itself away');
	// the window that was already queued must find the search gone and draw nothing
	await new Promise(res => window.setTimeout(res, 400));
	check(doc.querySelector('.day-list') === null, 'and nothing is drawn after it');
	check(doc.getElementById('search').classList.contains('is-stopped'), 'and the line still says stopped');

	console.log('\n=== a team that is declared and never plays ===');
	doc.forms[0]['config'].value = [
		'[sports]', 'Μπάσκετ', '',
		'[days]', '2026-08-10 2', '2026-08-11 2', '',
		'[teams]', '1η', '2η', '3η', '',
		'[groups]', 'kg Μπάσκετ 1: 1, 2', '',
	].join('\n');
	doc.forms[0].dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
	const notice = doc.getElementById('notice');
	console.log('  notice: ' + notice.textContent);
	check(notice.hidden === false && /3η/.test(notice.textContent), 'the idle team is named');
	// and a configuration where everyone plays says nothing
	doc.forms[0]['config'].value = [
		'[sports]', 'Μπάσκετ', '',
		'[days]', '2026-08-10 2', '2026-08-11 2', '',
		'[teams]', '1η', '2η', '',
		'[groups]', 'kg Μπάσκετ 1: 1, 2', '',
	].join('\n');
	doc.forms[0].dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
	check(doc.getElementById('notice').hidden === true, 'and nothing is said when everyone plays');

	console.log('\n=== a configuration that cannot be scheduled ===');
	// a configuration of its own, so that the refusal is the same one whatever
	// file drove the rest of the run: one day that holds no round at all
	doc.forms[0]['config'].value = [
		'[sports]', 'Μπάσκετ', '',
		'[days]', '2026-08-10 0', '',
		'[teams]', '1η', '2η', '',
		'[groups]', 'kg Μπάσκετ 1: 1, 2', '',
	].join('\n');
	doc.forms[0].dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
	console.log('  status: ' + doc.getElementById('search-status').textContent);
	check(doc.getElementById('search').classList.contains('is-error'), 'a refusal is marked as an error');
	check(doc.getElementById('stop').hidden === true, 'with nothing to stop');
	check(doc.getElementById('excel').disabled === true, 'and nothing to hand out');

	if (noise.length)
		console.log('\nNOISE:\n' + noise.slice(0, 20).join('\n'));
	window.close();
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
