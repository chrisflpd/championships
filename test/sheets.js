// drives the three tabs the way the camp does: opens the page, submits a
// configuration, changes a match on the plan, types scores on the pages and
// reads the points back off the standings.
const fs = require('fs');
const path = require('path');
const http = require('http');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const CONFIGS = process.argv.length > 2 ? process.argv.slice(2) : ['input26g.txt', 'test/configs/unnamed-zone.txt'];

// the same one browser behaviour page.js puts back, for the same reason
const SHIM = `<script>
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
		body = Buffer.from(body.toString('utf8').replace(/<script src="/, SHIM + '\n\t\t<script src="'), 'utf8');
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

	console.log('\n=== the three tabs ===');
	const tabs = [...doc.querySelectorAll('.sheet-tab')];
	check(tabs.length === 3, `${tabs.length} tabs`);
	check(tabs.map(t => t.dataset.sheet).join(',') === 'plan,pages,points', 'plan, pages and points, in that order');
	check(tabs[0].classList.contains('is-open'), 'the plan opens first');
	const configPanel = doc.querySelector('.panel-config');
	check(tabs[0].parentNode.nextElementSibling === configPanel && configPanel.hidden === false,
		'the configuration is integrated directly under the Program tab');
	check(doc.getElementById('sheet-plan').hidden === false, 'and its panel is the shown one');
	check(doc.getElementById('sheet-pages').hidden === true && doc.getElementById('sheet-points').hidden === true,
		'the other two are put away');
	click(tabs[1]);
	check(doc.getElementById('sheet-pages').hidden === false && doc.getElementById('sheet-plan').hidden === true,
		'clicking a tab brings its panel out and puts the other away');
	check(tabs[1].getAttribute('aria-selected') === 'true' && tabs[0].getAttribute('aria-selected') === 'false',
		'and says which one is open');
	check(configPanel.hidden === true, 'and the Program configuration leaves the other tabs');
	check(window.getComputedStyle(doc.querySelector('.pages-bar')).position === 'sticky',
		'the selected-days print control stays visible while the sheets scroll');

	console.log('\n=== the pages ===');
	// the days that hold a round, which are the ones worth handing out
	const wantDays = window.eval('window.currentProgram').filter(d => d.dzones.some(dz => dz.rounds.length));
	const cards = [...doc.querySelectorAll('.pages-day')];
	check(cards.length === wantDays.length, `${cards.length} day sheets for ${wantDays.length} days with rounds`);
	const fields = cfg.sports.reduce((n, s) => n + s.courts.length, 0);
	let rowBad = 0, roundBad = 0;
	cards.forEach((card, i) => {
		const rounds = wantDays[i].dzones.reduce((n, dz) => n + dz.rounds.length, 0);
		if (card.querySelectorAll('tbody tr').length !== rounds * fields) rowBad++;
		// one round label per round, each standing beside all the fields of it
		const labels = [...card.querySelectorAll('.pages-round')];
		if (labels.length !== rounds) roundBad++;
		if (labels.some(l => l.rowSpan !== fields)) roundBad++;
	});
	check(rowBad === 0, `every day sheet has a row per field of every round (${fields} fields)`);
	check(roundBad === 0, 'and every round names itself once beside its own rows');
	check(cards.every(card => card.querySelectorAll('colgroup col').length === 9),
		'every printed day keeps the nine column proportions of Excel C:K');
	check(cards.every(card => card.querySelector('.pages-date-screen') !== null
		&& card.querySelector('.pages-date-print') !== null),
		'every day carries its Greek screen date and its Excel-style print date');
	check(/^[A-Z][a-z]+, [A-Z][a-z]+ \d{2}, \d{4}$/.test(cards[0].querySelector('.pages-date-print').textContent),
		'the printed date uses Excel long-date wording');

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
	const table = [...doc.querySelectorAll('.points-group')]
		.filter(box => box.querySelector('.points-group-name').textContent === group.id)[0];
	check(table !== undefined, `the ${group.id} standings are on the page`);
	if (table !== undefined) {
		const head = [...table.querySelectorAll('thead th')].map(th => th.textContent);
		const draws = window.eval('wb_has_draw')(group.sport);
		check(head.includes('PLD') && head.includes('PTS') && head.includes('RNK'), 'with the columns of the template');
		check(head.includes('D') === draws,
			draws ? `${group.sport.name} can be drawn, so it has a D column` : `${group.sport.name} cannot be drawn, so it has no D column`);
		const first = table.querySelector('tbody tr');
		check(first.querySelector('.points-team').textContent === stand[0].team.name, 'the top of the table first');
		check(first.querySelector('.points-pts').textContent === String(stand[0].pts), 'and its points beside it');
	}
	check(doc.querySelector('.points-legend') === null, 'there is no separate symbol explanation block');
	check([...doc.querySelectorAll('.points-table thead th[title]')].some(th => th.textContent === 'PLD' && th.title === 'Αγώνες'),
		'hovering a standings symbol explains its meaning');

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
	check(configPanel.hidden === false, 'returning to Program brings its configuration back');
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
		check(/παίζει ήδη/.test(marked.title), 'and the cell says what is wrong with it');
	} else {
		check(true, 'only one match in that round, skipped');
	}

	console.log('\n=== what is handed out carries it ===');
	check(doc.getElementById('excel').disabled === false, 'the workbook is still there to be built');

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
