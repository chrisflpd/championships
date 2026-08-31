// the two things a slot can be told about itself: what cannot stand, and what is
// worth a second look. the second lot are the rules the search keeps, read back
// against a finished plan, so the check that matters most is that a plan the
// search found says nothing at all.
const { parse_config, schedule, browser_bits, read, configs } = require('./harness');
const caught = browser_bits();

const say = console.log;
console.log = () => {};
const fail = [];
const check = (ok, what) => { say((ok ? '  ok   ' : '  FAIL ') + what); if (!ok) fail.push(what); };

// a calendar of two days of two zones of two rounds, on three fields, so that a
// slot can be named outright instead of hunted for
const CONFIG = [
	'[sports]',
	'Ποδόσφαιρο: Γ1, Γ2',
	'Μπέιζμπολ: Γ1',
	'Μπάσκετ: Γ3',
	'',
	'[zones]',
	'Πρωί',
	'Απόγευμα',
	'',
	'[days]',
	'2026-08-10 2 2',
	'2026-08-11 2 2',
	'',
	'[teams]',
	'Α', 'Β', 'Γ', 'Δ', 'Ε', 'Ζ',
	'',
	'[groups]',
	'pg Ποδόσφαιρο 1: 1-6',
	'kg Μπάσκετ    1: 1-6',
	'bg Μπέιζμπολ  1: 1-4',
	'',
	'[knockouts]',
	'pf Ποδόσφαιρο pg:1 pg:2',
	'',
].join('\n');

//a slot of that calendar, by day, zone, round and field
const at = (day, zone, round, court) => wb_key(`2026-08-${10 + day}`, zone, round, court);

//the plan is laid out by hand, so that every rule is read against a slot that
//was put where it is on purpose
function laid(put) {
	parse_config(CONFIG);
	wb_build(config.days);
	workbook.slots = {};
	put();
	wb_recount();
}

function said(key) {
	return wb_complaints(key).concat(wb_cautions(key));
}

function says(key, what) {
	return said(key).some(one => one.indexOf(what) !== -1);
}

(async () => {

	say('=== a plan the search found says nothing about itself ===');
	// the rules the search keeps, read back off the plan it produced with them.
	// anything said here is the reading being stricter than the scheduling.
	for (const name of configs(9).slice(0, 4)) {
		parse_config(read(name));
		const program = schedule(60);
		if (program === null) {
			check(false, `${name}: could not be scheduled`);
			continue;
		}
		window.currentProgram = program;
		wb_build(program);
		wb_recount();
		let wrong = 0, careful = 0;
		const seen = [];
		Object.keys(workbook.slots).forEach(key => {
			wrong += wb_complaints(key).length;
			const mind = wb_cautions(key);
			careful += mind.length;
			mind.forEach(one => {
				if (!seen.includes(one)) seen.push(one);
			});
		});
		check(wrong === 0 && careful === 0,
			`${name}: ${Object.keys(workbook.slots).length} matches, nothing to say`
			+ (seen.length ? ' — ' + seen.join(' | ') : ''));
	}

	say('\n=== what cannot stand ===');

	laid(() => wb_put(at(0, 0, 0, 'Γ1'), 'kg', 3, 4));
	check(says(at(0, 0, 0, 'Γ1'), 'δεν είναι γήπεδο για'), 'a match on a field of another sport');

	laid(() => wb_put(at(0, 0, 0, 'Γ1'), 'pg', 3, 3));
	check(says(at(0, 0, 0, 'Γ1'), 'παίζει με τον εαυτό της'), 'a team against itself');

	laid(() => {
		wb_put(at(0, 0, 0, 'Γ1'), 'pg', 3, 4);
		wb_put(at(0, 0, 0, 'Γ2'), 'pg', 3, 5);
	});
	check(says(at(0, 0, 0, 'Γ2'), 'παίζει ήδη στον ίδιο γύρο'), 'a team twice in one round');

	say('\n=== what is worth a second look ===');

	// the same pair again in the same zone
	laid(() => {
		wb_put(at(0, 1, 0, 'Γ1'), 'pg', 3, 4);
		wb_put(at(0, 1, 1, 'Γ2'), 'pg', 3, 4);
	});
	check(says(at(0, 1, 1, 'Γ2'), 'συναντιούνται ξανά στην ίδια ζώνη'), 'the same pair twice in a zone');
	check(says(at(0, 1, 1, 'Γ2'), 'παίζουν και στον διπλανό γύρο'), 'and in the round beside');

	// the same pair, the same sport, the same day, a zone apart
	laid(() => {
		wb_put(at(0, 0, 1, 'Γ1'), 'pg', 3, 4);
		wb_put(at(0, 1, 1, 'Γ2'), 'pg', 3, 4);
	});
	check(says(at(0, 1, 1, 'Γ2'), 'ξανά την ίδια ημέρα'), 'the same pair twice in a day');

	// a team at the same sport in the round beside
	laid(() => {
		wb_put(at(0, 1, 0, 'Γ1'), 'pg', 3, 4);
		wb_put(at(0, 1, 1, 'Γ2'), 'pg', 3, 5);
	});
	check(says(at(0, 1, 1, 'Γ2'), 'και στον διπλανό γύρο'), 'a team at one sport in two rounds running');

	// the team of the camp's own, on the morning everybody arrives
	laid(() => wb_put(at(0, 0, 0, 'Γ1'), 'pg', 1, 4));
	check(says(at(0, 0, 0, 'Γ1'), 'ομάδα αγάπης'), 'the love team on the first morning');

	// six teams leave room for two matches a round
	laid(() => {
		wb_put(at(0, 1, 0, 'Γ1'), 'pg', 1, 2);
		wb_put(at(0, 1, 0, 'Γ2'), 'pg', 3, 4);
		wb_put(at(0, 1, 0, 'Γ3'), 'kg', 5, 6);
	});
	check(says(at(0, 1, 0, 'Γ3'), 'επιτρέπουν έως'), 'more matches in a round than the teams allow');

	// a knockout before the groups of its sport are done
	laid(() => {
		wb_put(at(0, 1, 0, 'Γ1'), 'pf', null, null);
		wb_put(at(1, 0, 0, 'Γ2'), 'pg', 3, 4);
	});
	check(says(at(0, 1, 0, 'Γ1'), 'προηγείται αγώνων ομίλου'), 'a knockout before the groups of its sport');

	say('\n=== and the baseball, which the camp spreads out ===');

	// the match that brings a team to the sport goes in the first round of a zone
	laid(() => wb_put(at(0, 1, 1, 'Γ1'), 'bg', 3, 4));
	check(says(at(0, 1, 1, 'Γ1'), 'πρώτο γύρο της ζώνης'), 'a team’s first baseball outside the first round');

	// and the diamond is left free in the round after it
	laid(() => {
		wb_put(at(0, 1, 0, 'Γ1'), 'bg', 3, 4);
		wb_put(at(0, 1, 1, 'Γ1'), 'pg', 5, 6);
	});
	check(says(at(0, 1, 1, 'Γ1'), 'μένει ελεύθερο στον γύρο μετά'), 'and the field taken in the round after it');

	// one to a zone, and the zones take them in turn
	laid(() => {
		wb_put(at(0, 1, 0, 'Γ1'), 'bg', 1, 2);
		wb_put(at(1, 0, 0, 'Γ2'), 'pg', 3, 4);
		wb_put(at(1, 1, 0, 'Γ1'), 'bg', 3, 4);
	});
	check(says(at(1, 1, 0, 'Γ1'), 'με τη σειρά'), 'and a zone passed over while they are spread');

	say('\n=== the two are told apart ===');
	laid(() => {
		wb_put(at(0, 1, 0, 'Γ1'), 'pg', 3, 4);
		wb_put(at(0, 1, 1, 'Γ2'), 'pg', 3, 4);
	});
	check(wb_complaints(at(0, 1, 1, 'Γ2')).length === 0
		&& wb_cautions(at(0, 1, 1, 'Γ2')).length > 0,
		'a plan that can be played says nothing under Παραβίαση κανόνα');
	laid(() => wb_put(at(0, 1, 0, 'Γ1'), 'kg', 3, 4));
	check(wb_complaints(at(0, 1, 0, 'Γ1')).length > 0,
		'and one that cannot says it there and not under Συνιστάται προσοχή');

	say(fail.length ? `\n${fail.length} FAILED\n  ` + fail.join('\n  ') : '\nall checks passed');
	process.exit(fail.length ? 1 : 0);
})();
