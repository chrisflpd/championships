const assert = require('node:assert/strict');
const vm = require('node:vm');
const h = require('./harness');
h.load('src/js/workbook.js');
h.load('src/js/displayer.js');
vm.runInThisContext('global.tbConfig = config; global.tbWorkbook = workbook;');

function setup(rules, games, sport = 'Ποδόσφαιρο', teams = 4, points = '') {
	const text = `[sports]\n${sport}${points}: Α\n[zones]\nΠρωί\n[days]\n2026-08-10 30\n[teams]\n${Array.from({length: teams}, (_, i) => `${i + 1}η`).join('\n')}\n[groups]\ng ${sport} ${teams - 1}: 1-${teams}\n[knockouts]\nf ${sport} g:1 g:2\n`
		+ (rules === null ? '' : `[tiebreakers]\n${sport}: ${rules}\n`);
	parse_config(text);
	wb_build(tbConfig.days);
	tbWorkbook.slots = {};
	tbWorkbook.results = {};
	wb_recount();
	games.forEach(([home, away, sh, sa], i) => {
		const key = wb_key('2026-08-10', 0, i, 'Α');
		wb_put(key, 'g', home, away);
		wb_set_result(wb_at(key), sh, sa, '');
	});
	wb_recount();
	return text;
}
const ranks = () => wb_standings(tbConfig.groups.g);
const order = () => ranks().map(row => row.team.id);
const rules = 'μεταξύ_τους, συνολική_διαφορά, συνολικά_υπέρ';
const twoTied = [[1,2,0,1], [1,3,10,0], [2,4,0,1], [3,4,0,10]];

setup(rules, twoTied);
assert.deepEqual(order(), [4,2,1,3], 'direct winner outranks better overall difference');
assert.deepEqual(ranks().map(r => r.rnk), [1,2,2,4], 'RNK stays points-only');
assert.deepEqual(ranks().map(r => r.frnk), [1,2,3,4], 'FRNK is unique');
assert.equal(wb_side(tbConfig.knockouts.f.away, {}), 2, 'qualification uses FRNK');
assert.ok(ranks().find(r => r.team.id === 2).rank_reason.includes('μεταξύ τους'));
assert.ok(ranks().every(r => !r.rank_provisional));

setup('συνολική_διαφορά, μεταξύ_τους', twoTied);
assert.deepEqual(order(), [4,1,2,3], 'manager order controls ranking');
setup(null, twoTied);
assert.deepEqual(tiebreak_order(tbConfig.sports[0]), [
	'μεταξύ_τους', 'μεταξύ_τους_διαφορά', 'μεταξύ_τους_υπέρ', 'μεταξύ_τους_κατά',
	'συνολικές_νίκες', 'συνολική_διαφορά', 'συνολικά_υπέρ', 'συνολικά_κατά', 'id',
], 'every sport receives the complete default order without a section');
assert.deepEqual(order(), [4,2,1,3], 'omitting the optional section applies the default order');

const cycle = [[1,2,1,0], [2,3,2,0], [3,1,3,0]];
setup(rules, cycle, 'Ποδόσφαιρο', 3);
assert.deepEqual(order(), [2,3,1], 'circular three-way tie resolves globally then restarts for remaining pair');
setup(rules, cycle.slice().reverse(), 'Ποδόσφαιρο', 3);
assert.deepEqual(order(), [2,3,1], 'fixture iteration order cannot change ranking');
setup(rules, [[1,2,1,0],[2,3,1,0],[3,1,1,0]], 'Ποδόσφαιρο', 3);
assert.deepEqual(order(), [1,2,3], 'perfect circular tie reaches numeric ID fallback');

setup(rules, [[1,2,1,0],[1,3,1,0],[4,1,1,0],[2,3,1,0],[2,4,1,0],[3,4,1,0]]);
const fourTied = [4,3,2,1].map(id => ({team:{id},pts:10,gd:0,gf:3,ga:3,w:2}));
assert.deepEqual(wb_final_ranks(tbConfig.groups.g, fourTied).map(r=>r.team.id), [1,2,3,4],
	'four-way mini-table splits into two pairs and restarts each independently');
setup(rules, [[1,2,1,0],[2,3,1,1],[3,1,1,0]], 'Ποδόσφαιρο', 3, ' 5-2-1');
const customMini = wb_mini_table(tbConfig.groups.g, ranks(), wb_placed().map(p=>p.game));
assert.deepEqual([1,2,3].map(id=>customMini.get(id).pts), [6,3,7], 'mini-table uses custom sport points');

setup(rules, [[1,2,1,0]], 'Ποδόσφαιρο', 3);
const equal = [1,2,3].map(id => ({team:{id},pts:3,gd:0,gf:1,ga:1,w:1}));
assert.deepEqual(wb_final_ranks(tbConfig.groups.g, equal).map(r=>r.team.id), [1,2,3]);
assert.ok(equal.every(r => r.rank_reason === 'Μικρότερο ID ομάδας'),
	'missing mutual fixtures are omitted and only the deciding rule is explained');
setup(rules, cycle.concat([[1,2,1,0]]), 'Ποδόσφαιρο', 3);
assert.equal(wb_mini_table(tbConfig.groups.g, ranks(), wb_placed().map(p=>p.game)), null, 'unequal pair counts disable mini-table');
setup(rules, [[1,2,null,null]], 'Ποδόσφαιρο', 2);
assert.ok(ranks().every(r => r.rank_provisional));
assert.equal(wb_side(tbConfig.knockouts.f.home, {}), null, 'unscored matches do not qualify teams');
setup(rules, [[1,2,2,2]], 'Ποδόσφαιρο', 2);
assert.deepEqual(order(), [1,2], 'drawn direct match falls through to ID');
setup('μεταξύ_τους, μεταξύ_τους_διαφορά, μεταξύ_τους_υπέρ', [[1,2,1,0],[2,1,3,0]], 'Ποδόσφαιρο', 2);
const mini = wb_mini_table(tbConfig.groups.g, ranks(), wb_placed().map(p=>p.game));
assert.equal(mini.get(1).w, mini.get(2).w);
assert.deepEqual(order(), [2,1], 'split direct wins fall through to mutual score difference');

for (const sport of ['Μπάσκετ','Μπέιζμπολ']) {
	setup(rules, twoTied, sport);
	assert.deepEqual(order(), [4,2,1,3], `${sport}: direct winner breaks tie`);
}
setup(rules, [[1,2,2,0],[2,3,2,1],[3,1,2,1]], 'Βόλεϊ', 3);
assert.deepEqual(order(), [1,3,2], 'volleyball uses configured points, then direct winner');
setup('συνολική_διαφορά, συνολικά_υπέρ', [[1,2,2,1],[2,3,2,1],[3,1,2,1]], 'Βόλεϊ', 3);
assert.deepEqual(order(), [1,2,3], 'set statistics tie falls to ID');

// Same points/difference, different total scored; and independent wins/against.
setup('συνολικά_υπέρ', [], 'Ποδόσφαιρο', 2);
const synthetic = () => [{team:{id:1},pts:3,gd:1,gf:2,ga:1,w:2}, {team:{id:2},pts:3,gd:1,gf:4,ga:3,w:1}];
assert.deepEqual(wb_final_ranks(tbConfig.groups.g, synthetic()).map(r=>r.team.id), [2,1]);
tbConfig.sports[0].tiebreakers = ['συνολικές_νίκες','id'];
assert.deepEqual(wb_final_ranks(tbConfig.groups.g, synthetic()).map(r=>r.team.id), [1,2]);
tbConfig.sports[0].tiebreakers = ['id'];
assert.deepEqual(wb_final_ranks(tbConfig.groups.g, [10,2].map(id=>({team:{id},pts:0}))).map(r=>r.team.id),
	[2,10], 'ID fallback compares numbers, not strings');
tbConfig.sports[0].tiebreakers = ['συνολικά_κατά','id'];
assert.deepEqual(wb_final_ranks(tbConfig.groups.g, synthetic()).map(r=>r.team.id), [1,2]);
setup('μεταξύ_τους_κατά', [[1,2,1,0],[2,1,3,0]], 'Ποδόσφαιρο', 2);
assert.deepEqual(order(), [2,1], 'mutual against prefers the team that conceded fewer in mutual matches');

const text = setup(rules, twoTied);
assert.deepEqual(tbConfig.sports[0].tiebreakers, ['μεταξύ_τους','συνολική_διαφορά','συνολικά_υπέρ','id']);
for (const invalid of ['', 'τυπογραφικό', 'id, συνολικές_νίκες', 'συνολικές_νίκες, συνολικές_νίκες', 'συνολικές_νίκες,', 'νίκες', 'λιγότερα_κατά'])
	assert.throws(() => parse_config(text.replace(rules, invalid)), /Ισοβαθμίες/);
assert.throws(() => parse_config(text + 'Ποδόσφαιρο: id\n'), /δύο φορές/);
assert.throws(() => parse_config(text + 'Άγνωστο: id\n'), /άγνωστο άθλημα/);
parse_config('[tiebreakers]\nΠοδόσφαιρο: id\n' + text.split('[tiebreakers]')[0]);
assert.deepEqual(tbConfig.sports[0].tiebreakers, ['id'], 'section can precede sports');
console.log('ok: configurable tie-breakers, FRNK, direct results, mini-tables, subgroup restart, fallbacks and parser validation');
