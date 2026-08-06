// configurations the camp has never used, put through the parser, the scheduler
// and the export. nothing here needs a snapshot: it checks behaviour, not bytes.
const { parse_config, schedule, browser_bits } = require('./harness');
const caught = browser_bits();


// every cell the export writes, so that a lost or overwritten match is visible
let written = {}, clashes = [];
const realSetCellText = global.setCellText;
global.setCellText = function (doc, cellElem, text) {
	const ref = cellElem.getAttribute('r');
	if (ref in written && written[ref] !== text) clashes.push(ref);
	written[ref] = text;
	return realSetCellText.apply(this, arguments);
};

const alerts = caught.alerts;
const say = console.log;
console.log = () => {};
const fail = [];
const check = (ok, what) => { say((ok ? '  ok   ' : '  FAIL ') + what); if (!ok) fail.push(what); };

const cfg = (days, zones, courts, sport, per) => `[sports]
${sport || 'Ποδόσφαιρο'}: ${courts.join(', ')}

[zones]
${zones.join('\n')}

[days]
${days}

[teams]
1η
2η
3η
4η
5η
6η

[groups]
pg ${(sport || 'Ποδόσφαιρο').split(' ')[0]} ${per || 2}: 1-6
`;
const dayLines = (n, counts) => Array.from({ length: n },
	(_, i) => `2026-08-${String(10 + i).padStart(2, '0')} ${counts}`).join('\n');

async function attempt(text) {
	alerts.length = 0; caught.bytes = null; written = {}; clashes = [];
	parse_config(text);
	const program = schedule(25);
	if (!program) return { program: null };
	const placed = program.reduce((n, d) => n + d.dzones.reduce((m, z) => m + z.rounds.reduce(
		(k, r) => k + Object.values(r.slots).filter(s => s.match).length, 0), 0), 0);
	window.currentProgram = program;
	await exportToExcel();
	return { program, placed, produced: caught.bytes !== null, written: Object.keys(written).length, clashes: clashes.length, alerts };
}

(async () => {
	say('=== a configuration too big for the template is refused, not truncated ===');
	const tooBig = {
		'3 rounds a zone': cfg(dayLines(2, '3 3'), ['Πρωί', 'Απόγευμα'], ['Γ1', 'Γ2']),
		'4 rounds a zone': cfg(dayLines(2, '4 4'), ['Πρωί', 'Απόγευμα'], ['Γ1', 'Γ2']),
		'3 zones': cfg(dayLines(4, '2 2 2'), ['Πρωί', 'Μεσημέρι', 'Βράδυ'], ['Γ1', 'Γ2']),
		'6 courts': cfg(dayLines(6, '2 2'), ['Πρωί', 'Απόγευμα'], ['Γ1', 'Γ2', 'Γ3', 'Γ4', 'Γ5', 'Γ6']),
		'14 days': cfg(dayLines(14, '2 2'), ['Πρωί', 'Απόγευμα'], ['Γ1', 'Γ2']),
	};
	for (const [name, text] of Object.entries(tooBig)) {
		const r = await attempt(text);
		if (r.program === null) { check(false, name + ': could not even schedule'); continue; }
		const why = (r.alerts[0] || '').replace(/\s+/g, ' ');
		check(!r.produced && /δεν χωράει/.test(why), `${name}: no file — ${why.slice(21, 130)}`);
	}

	say('\n=== a configuration that does fit still exports every match ===');
	const fits = {
		'2 rounds a zone': cfg(dayLines(4, '2 2'), ['Πρωί', 'Απόγευμα'], ['Γ1', 'Γ2']),
		'1 round a zone': cfg(dayLines(8, '1 1'), ['Πρωί', 'Απόγευμα'], ['Γ1', 'Γ2']),
		'1 zone of 4 rounds': cfg(dayLines(6, '4'), ['Ημέρα'], ['Γ1', 'Γ2']),
		'4 zones of 1 round': cfg(dayLines(3, '1 1 1 1'), ['Α', 'Β', 'Γ', 'Δ'], ['Γ1', 'Γ2']),
		'5 courts': cfg(dayLines(6, '2 2'), ['Πρωί', 'Απόγευμα'], ['Γ1', 'Γ2', 'Γ3', 'Γ4', 'Γ5']),
		'12 days': cfg(dayLines(12, '2 2'), ['Πρωί', 'Απόγευμα'], ['Γ1', 'Γ2']),
	};
	for (const [name, text] of Object.entries(fits)) {
		const r = await attempt(text);
		if (r.program === null) { check(false, name + ': could not schedule'); continue; }
		check(r.produced && r.written === r.placed && r.clashes === 0,
			`${name}: ${r.written} of ${r.placed} matches written, ${r.clashes} overwritten`);
	}

	say('\n=== a sport the program has never heard of ===');
	const r1 = await attempt(cfg(dayLines(4, '2 2'), ['Πρωί', 'Απόγευμα'], ['Κ1', 'Κ2'], 'Χάντμπολ'));
	check(r1.program !== null, 'Χάντμπολ parses, schedules and exports');
	check(config.sports[0].points_fn(2, 1)[0] === 3 && config.sports[0].points_fn(1, 1)[0] === 1,
		'and scores 3 for a win and 1 for a draw by default');

	const r2 = await attempt(cfg(dayLines(4, '2 2'), ['Πρωί', 'Απόγευμα'], ['Κ1', 'Κ2'], 'Χάντμπολ 5-2-1'));
	check(r2.program !== null, 'Χάντμπολ 5-2-1 parses too');
	const fn = config.sports[0].points_fn;
	check(JSON.stringify([fn(3, 1), fn(1, 3), fn(2, 2)]) === '[[5,1],[1,5],[2,2]]',
		'and scores exactly what the line says: ' + JSON.stringify([fn(3, 1), fn(1, 3), fn(2, 2)]));

	parse_config(cfg(dayLines(2, '2 2'), ['Πρωί', 'Απόγευμα'], ['Γ1', 'Γ2']));
	const football = config.sports[0].points_fn;
	check(JSON.stringify([football(2, 1), football(1, 2), football(1, 1)]) === '[[3,0],[0,3],[1,1]]',
		'a sport the program does know keeps its own scoring');

	say(fail.length ? `\n${fail.length} FAILED` : '\nall checks passed');
	process.exit(fail.length ? 1 : 0);
})();
