/*
 * proves that a change to the scheduler changes no schedule.
 *
 *   node test/schedule.js save     before you touch the rules
 *   node test/schedule.js check    after
 *
 * the search shuffles the matches and gives up on a clock, so ordinarily it
 * finds a different program every run and two runs cannot be compared. Here the
 * shuffle is given a fixed seed, and the clock is replaced by a count of the
 * times the scheduler is entered — it reads the clock exactly once per entry —
 * so the budget is the same on every machine. What comes out is then the same
 * every run, and a difference between two runs can only be the change.
 *
 * A refactoring that is meant to keep the rules must leave every fingerprint
 * alone. A change that is meant to alter them will show exactly which
 * configurations it moved.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// both of these have to be in place before the app is loaded
let seed = 0x2f6df0;
Math.random = function () {
	seed |= 0; seed = seed + 0x6D2B79F5 | 0;
	let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
	t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
	return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
const ENTRIES_PER_MS = 8;      // the 3000 ms window becomes 24,000 entries
const TICK_START = 10000 * ENTRIES_PER_MS;   // never zero: the scheduler reads
let tick = TICK_START;                       // a start time of 0 as "no limit"
Date.now = () => tick++ / ENTRIES_PER_MS;

const { parse_config, read, configs } = require('./harness');

const DIR = path.join(__dirname, '.snapshot');
const FILE = path.join(DIR, 'schedules.json');
const MODE = process.argv[2];
const WINDOWS = 6;   // orderings to try per configuration

const say = console.log;
console.log = () => {};

// everything a program says about where a match ended up
function fingerprint(program) {
	if (program === null)
		return 'none';
	const lines = [];
	program.forEach(day => day.dzones.forEach((dzone, dz) => dzone.rounds.forEach((round, r) => {
		Object.keys(round.slots).sort().forEach(court => {
			const match = round.slots[court].match;
			if (!match) return;
			const who = ('id' in match.team_home && 'id' in match.team_away)
				? match.team_home.id + '-' + match.team_away.id
				: match.id;
			lines.push(`${day.date.toISOString().slice(0, 10)} z${dz} r${r} ${court} ${match.sport.name} ${who}`);
		});
	})));
	return crypto.createHash('sha256').update(lines.sort().join('\n')).digest('hex').slice(0, 16)
		+ ' (' + lines.length + ' matches)';
}

if (MODE !== 'save' && MODE !== 'check') {
	say('usage: node test/schedule.js save|check [config ...]');
	process.exit(2);
}

const now = {};
for (const name of configs(3)) {
	parse_config(read(name));
	seed = 0x2f6df0;   // the same dice for every configuration
	tick = TICK_START;
	const marks = [];
	for (let w = 0; w < WINDOWS; w++) {
		let program = null;
		try { program = search_run_window(); }
		catch (error) { if (!/TIMEOUT/.test(error.message)) throw error; }
		marks.push(fingerprint(program));
	}
	now[name] = marks;
}

fs.mkdirSync(DIR, { recursive: true });
if (MODE === 'save') {
	fs.writeFileSync(FILE, JSON.stringify(now, null, '\t'));
	Object.entries(now).forEach(([name, marks]) => {
		say(`  ${name.padEnd(30)} ${marks.filter(m => m !== 'none').length}/${marks.length} orderings found a program`);
	});
	say('\nsnapshot taken');
	process.exit(0);
}

if (!fs.existsSync(FILE)) {
	say('nothing saved — run "save" first');
	process.exit(1);
}
const was = JSON.parse(fs.readFileSync(FILE, 'utf8'));
let bad = 0;
for (const name of Object.keys(now)) {
	const before = (was[name] || []).join('|');
	const after = now[name].join('|');
	if (before === after) {
		say(`  same    ${name.padEnd(30)} all ${now[name].length} orderings identical`);
		continue;
	}
	bad++;
	say(`  CHANGED ${name}`);
	now[name].forEach((mark, i) => {
		const old = (was[name] || [])[i];
		if (old !== mark) say(`            ordering ${i}: was ${old}  now ${mark}`);
	});
}
say(bad ? `\n${bad} configuration(s) schedule differently` : '\nthe scheduler produces exactly what it did before');
process.exit(bad ? 1 : 0);
