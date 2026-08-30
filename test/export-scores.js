// the workbook that is handed out has to carry what the camp did on the page:
// the plan as it stands after a match was moved, and the scores and referees
// typed on the pages. this exports one and reads it back cell by cell.
const { parse_config, schedule, browser_bits, read } = require('./harness');
const caught = browser_bits();

const CONFIG = process.argv[2] || 'input26g.txt';
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

const say = console.log;
console.log = () => {};
const fail = [];
const check = (ok, what) => { say((ok ? '  ok   ' : '  FAIL ') + what); if (!ok) fail.push(what); };
global.alert = msg => { caught.alerts.push(String(msg)); };

// the pages sheet gives every day a block of 22 rows, the matches on the 20
// after the date, five fields to a round
const rowOf = row => ({
	day: Math.floor((row - 4) / 22),
	round: Math.floor(((row - 4) % 22) / 5),
	field: ((row - 4) % 22) % 5,
});

function sheetCells(doc) {
	const out = {};
	const cells = doc.getElementsByTagName('c');
	for (let i = 0; i < cells.length; i++) {
		const cell = cells[i];
		const is = cell.getElementsByTagName('is')[0];
		const v = cell.getElementsByTagName('v')[0];
		if (is !== undefined)
			out[cell.getAttribute('r')] = is.textContent;
		else if (v !== undefined && cell.getElementsByTagName('f').length === 0)
			out[cell.getAttribute('r')] = v.textContent;
	}
	return out;
}

(async () => {
	parse_config(read(CONFIG));
	const program = schedule(60);
	if (program === null) {
		say('  FAIL could not schedule ' + CONFIG);
		process.exit(1);
	}
	window.currentProgram = program;
	wb_build(program);

	say('=== a match moved and a score typed in ===');
	const placed = wb_placed();
	const group = placed.filter(one => one.game.kn === null);
	check(group.length > 0, `${group.length} group matches placed`);

	// a score, a referee, and a match moved into a slot that is free
	const scored = group[0];
	wb_set_result(scored.game, 4, 2, 'Δοκιμή');

	const taken = {};
	placed.forEach(one => { taken[one.key] = true; });
	const mover = group[1];
	// a free slot on a field the sport plays on, anywhere the calendar has one, so
	// the move stays inside the grid the template gives
	let landing = null;
	workbook.calendar.forEach(day => day.dzones.forEach(dzone => dzone.rounds.forEach(round => {
		workbook.cols.forEach(col => {
			const key = wb_key(day.iso, dzone.zone.rank, round.rank, col.court);
			if (landing === null && !taken[key] && wb_at(key) === null && col.sport.name === mover.game.sport.name)
				landing = key;
		});
	})));
	if (landing !== null)
		wb_move(mover.key, landing);
	check(landing === null || wb_at(landing) !== null, landing === null
		? 'no free slot of the same sport to move into, skipped'
		: 'a match moved into a free slot of its own sport');

	caught.bytes = null;
	caught.alerts.length = 0;
	await exportToExcel();
	check(caught.bytes !== null, 'a workbook was produced' + (caught.alerts.length ? ' — ' + caught.alerts.join(' | ') : ''));
	if (caught.bytes === null) {
		say('\n1 FAILED');
		process.exit(1);
	}

	const zip = await JSZip.loadAsync(caught.bytes);
	const parser = new DOMParser();
	const pages = sheetCells(parser.parseFromString(await zip.file('xl/worksheets/sheet5.xml').async('string'), 'text/xml'));
	const plan = sheetCells(parser.parseFromString(await zip.file('xl/worksheets/sheet1.xml').async('string'), 'text/xml'));

	say('\n=== the score reached the pages sheet ===');
	const scoreRows = Object.keys(pages).filter(ref => /^I\d+$/.test(ref) && pages[ref] === '4')
		.map(ref => parseInt(ref.slice(1), 10))
		.filter(row => pages['J' + row] === '2' && pages['K' + row] === 'Δοκιμή');
	check(scoreRows.length === 1, `${scoreRows.length} row carries 4 – 2 with the referee beside it`);
	if (scoreRows.length === 1) {
		const at = rowOf(scoreRows[0]);
		// the day block is the day of the match, counted from the first of the program
		const first = getDateSerial(program[0].date);
		const want_day = getDateSerial(scored.day.date) - first;
		const want_field = workbook.cols.findIndex(col => col.court === scored.col.court && col.sport.name === scored.col.sport.name);
		check(at.day === want_day, `on the block of day ${want_day}, which is the day it is played`);
		check(at.field === want_field, `and on the row of field ${want_field}, which is ${scored.col.court}`);

		// the very same round and field of the plan holds that match
		const ref = getCellRef(at.day, at.round, at.field);
		const pair = [wb_char(scored.game.home), wb_char(scored.game.away)].join('-');
		check(plan[ref] === pair, `and the plan cell ${ref} above it reads ${pair}`);
	}

	say('\n=== the plan carries the move ===');
	if (landing !== null) {
		const moved = wb_at(landing);
		const pair = [wb_char(moved.home), wb_char(moved.away)].join('-');
		const found = Object.keys(plan).filter(ref => plan[ref] === pair);
		check(found.length >= 1, `the moved match reads ${pair} somewhere on the plan`);
		// and it is not still written where it came from
		const gone = wb_at(mover.key);
		check(gone === null, 'and the slot it left holds nothing');
	}

	say('\n=== every match of the plan is written and none twice ===');
	const pairs = {};
	let clash = 0;
	wb_placed().forEach(one => {
		const label = one.game.kn !== null ? one.game.kn
			: [wb_char(one.game.home), wb_char(one.game.away)].join('-');
		pairs[label] = (pairs[label] || 0) + 1;
	});
	const onPlan = {};
	Object.keys(plan).forEach(ref => {
		// the plan cells are the ones inside the day blocks; the dates are numbers
		if (/^[A-Z]+\d+$/.test(ref) && /^[0-9A-Z]-[0-9A-Z]$/.test(String(plan[ref])))
			onPlan[plan[ref]] = (onPlan[plan[ref]] || 0) + 1;
	});
	Object.keys(pairs).forEach(label => {
		if (!/^[0-9A-Z]-[0-9A-Z]$/.test(label))
			return;
		if ((onPlan[label] || 0) !== pairs[label])
			clash++;
	});
	check(clash === 0, `all ${Object.keys(pairs).length} matches of the plan are on the sheet, each as many times as it is played`);

	say('\n=== the workbook works itself out when it is opened ===');
	const wb = await zip.file('xl/workbook.xml').async('string');
	check(/fullCalcOnLoad="1"/.test(wb), 'the games and the points are recalculated rather than shown as the template left them');

	say(fail.length ? `\n${fail.length} FAILED\n  ` + fail.join('\n  ') : '\nall checks passed');
	process.exit(fail.length ? 1 : 0);
})();
