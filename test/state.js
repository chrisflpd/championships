// Deterministic state tests: no randomized scheduling or external server needed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const configText = `[sports]
Ποδόσφαιρο: Α, Β
Μπάσκετ: Γ
[zones]
Πρωί
Απόγευμα
[days]
2026-08-10 1 2
2026-08-12 2 2
[teams]
Πρώτη
Δεύτερη
Τρίτη
Τέταρτη
[groups]
pg Ποδόσφαιρο: 1v2, 1v2, 3v4
bg Μπάσκετ: 1v3
[knockouts]
pf Ποδόσφαιρο pg:1 pg:2
[tiebreakers]
Ποδόσφαιρο: μεταξύ_τους, συνολική_διαφορά, συνολικά_υπέρ
Μπάσκετ: νίκες, id
`;

async function page(url = 'https://example.test/championships/', kept = {}) {
	const errors = [];
	const vc = new VirtualConsole();
	vc.on('jsdomError', error => errors.push(error.message));
	const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
	const w = dom.window;
	for (const link of w.document.querySelectorAll('link[rel="stylesheet"]')) {
		const style = w.document.createElement('style');
		style.textContent = fs.readFileSync(path.join(ROOT, link.getAttribute('href').split('?')[0]), 'utf8');
		link.replaceWith(style);
	}
	w.setImmediate = setImmediate;
	w.clearImmediate = clearImmediate;
	for (const [key, value] of Object.entries(kept)) w.localStorage.setItem(key, value);
	Object.defineProperty(w.document.forms[0], 'config', { value: w.document.querySelector('textarea') });
	for (const match of html.matchAll(/<script(?: src="([^"]+)")?>([\s\S]*?)<\/script>/g)) {
		vm.runInContext(match[1] ? fs.readFileSync(path.join(ROOT, match[1].split('?')[0]), 'utf8') : match[2], dom.getInternalVMContext());
	}
	await new Promise(resolve => w.setTimeout(resolve, 0));
	assert.deepEqual(errors, []);
	return w;
}

function plan(w) { return JSON.stringify(w.wb_snapshot()); }
function stored(w) { return JSON.stringify({ ...w.localStorage }); }
function samePlan(a, b) { assert.deepEqual(JSON.parse(a), JSON.parse(b)); }

(async () => {
	const w = await page();
	const hints = [...w.document.querySelectorAll('.toolbar button')];
	assert.equal(hints.length, 7);
	assert.ok(hints.every(button => button.dataset.tooltip.length > 25 && !button.hasAttribute('title')),
		'every configuration action uses the quick custom tooltip, not a delayed native title');
	const exportHint = w.document.getElementById('backup-export').dataset.tooltip;
	const importHint = w.document.getElementById('backup-import').dataset.tooltip;
	assert.equal(importHint, exportHint.replace('Αποθηκεύει', 'Επαναφέρει').replace(' σε αρχείο', ' από αρχείο'),
		'import and export describe the same data in opposite directions');
	const tooltipRules = [...w.document.styleSheets].flatMap(sheet => [...sheet.cssRules]);
	const sharedHint = tooltipRules.find(rule => rule.selectorText?.includes('.points-table thead th[data-tooltip]::after')
		&& rule.selectorText.includes('.toolbar button[data-tooltip]::after'));
	assert.ok(sharedHint, 'standings and toolbar share the same tooltip styling');
	assert.equal(sharedHint.style.background, 'rgb(32, 33, 36)');
	assert.equal(sharedHint.style.transition, 'opacity .12s ease, transform .12s ease');
	assert.equal(w.getComputedStyle(w.document.getElementById('excel')).opacity, '1',
		'disabled buttons do not fade the dark tooltip');
	w.parse_config(configText);
	w.document.forms[0].config.value = configText;
	w.displayer(w.eval('config.days'));
	const keys = w.share_slots();
	w.wb_put(keys[0], 'pg', 1, 2);
	w.wb_put(keys[1], 'pg', 1, 2);
	w.wb_put(keys[4], 'pg', 3, 4);
	w.wb_put(keys[8], 'bg', 1, 3);
	w.wb_put(keys[16], 'pf', null, null);
	w.wb_set_result(w.wb_at(keys[0]), 3, 1, 'Διαιτητής Α');
	w.wb_history_reset();
	w.sheets_draw();
	const initial = plan(w);
	assert.equal(w.document.getElementById('plan-undo').disabled, true);

	w.wb_move(keys[0], keys[7]);
	const moved = plan(w);
	assert.notEqual(moved, initial);
	assert.equal(w.document.getElementById('plan-undo').disabled, false);
	w.document.getElementById('plan-undo').click();
	samePlan(plan(w), initial);
	assert.equal(w.document.getElementById('plan-redo').disabled, false);
	w.document.getElementById('plan-redo').click();
	samePlan(plan(w), moved);
	assert.equal(w.wb_result(w.wb_at(keys[7])).ref, 'Διαιτητής Α');
	const shortcut = (key, modifiers = {}, target = w.document.body) => {
		const event = new w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers });
		target.dispatchEvent(event);
		return event.defaultPrevented;
	};
	w.sheets_show('plan');
	for (const modifier of ['ctrlKey', 'metaKey']) {
		assert.equal(shortcut('z', { [modifier]: true }), true);
		samePlan(plan(w), initial);
		assert.equal(shortcut('y', { [modifier]: true }), true);
		samePlan(plan(w), moved);
		shortcut('ζ', { [modifier]: true, code: 'KeyZ' });
		samePlan(plan(w), initial);
		shortcut('Z', { [modifier]: true, shiftKey: true, code: 'KeyZ' });
		samePlan(plan(w), moved);
	}
	for (const sheet of ['pages', 'points', 'config']) {
		w.sheets_show(sheet);
		assert.equal(shortcut('z', { ctrlKey: true }), false, 'other tabs retain native shortcuts');
		samePlan(plan(w), moved);
	}
	w.sheets_show('plan');
	for (const target of [w.document.querySelector('textarea'), w.document.querySelector('.pages-input')]) {
		assert.equal(shortcut('z', { metaKey: true }, target), false, 'text undo stays native');
	}
	for (const modifiers of [{}, { ctrlKey: true, altKey: true }, { ctrlKey: true, isComposing: true }])
		assert.equal(shortcut('z', modifiers), false);
	const editor = w.document.createElement('div');
	editor.className = 'plan-editor';
	w.document.body.appendChild(editor);
	assert.equal(shortcut('z', { ctrlKey: true }), false, 'open match editor is not disrupted');
	editor.remove();
	samePlan(plan(w), moved);
	console.log('ok: Greek button hints and plan-only Ctrl/Cmd undo/redo shortcuts');
	w.wb_history_step(false);
	w.wb_clear(keys[1]);
	assert.equal(w.eval('wb_history.future.length'), 0, 'new edit discards redo');
	w.wb_history_step(false);
	samePlan(plan(w), initial);

	for (const pairs of [w.wb_round_pairs(keys[0].split('|').slice(0, 3).join('|'), keys[7].split('|').slice(0, 3).join('|')),
		w.wb_zone_pairs(keys[0].split('|').slice(0, 2).join('|'), keys[8].split('|').slice(0, 2).join('|'))]) {
		w.wb_history_reset();
		w.wb_swap(pairs);
		assert.equal(w.eval('wb_history.past.length'), 1, 'whole round/zone is one undo');
		w.wb_history_step(false);
		samePlan(plan(w), initial);
	}
	w.wb_history_reset();
	w.wb_set_teams(keys[0], 2, 4);
	w.wb_history_step(false);
	samePlan(plan(w), initial);
	w.wb_set_result(w.wb_at(keys[0]), 9, 8, 'Άλλος');
	w.wb_history_step(false);
	samePlan(plan(w), initial);
	console.log('ok: undo/redo moves, swaps, team edits, scores, referees, and redo branching');
	w.wb_history_reset();
	w.wb_move(keys[0], keys[0]);
	assert.equal(w.eval('wb_history.past.length'), 0, 'no-op does not create history');
	for (let i = 0; i < 105; i++) w.wb_set_result(w.wb_at(keys[0]), i, 0, '');
	assert.equal(w.eval('wb_history.past.length'), 100, 'history is bounded');
	w.wb_set_result(w.wb_at(keys[0]), 3, 1, 'Διαιτητής Α');
	w.wb_history_reset();
	samePlan(plan(w), initial);

	const backup = JSON.parse(JSON.stringify(w.backup_data()));
	assert.ok(backup.configuration.includes('[tiebreakers]'), 'backups carry the ordered rules in configuration');
	const storageBefore = stored(w), historyBefore = w.eval('JSON.stringify(wb_history)');
	const invalid = [
		{ ...backup, version: 99 }, { ...backup, configuration: 'bad' },
		{ ...backup, configuration: configText.replace('2026-08-10 1 2', '2026-08-10 99999999999 2') },
		{ ...backup, workbook: { ...backup.workbook, sig: 'wrong' } },
		{ ...backup, workbook: { ...backup.workbook, results: { bad: { sh: -1, sa: 2, ref: '' } } } },
		{ ...backup, workbook: { ...backup.workbook, plan: { invalid: backup.workbook.plan[keys[0]] } } },
	];
	for (const data of invalid) {
		assert.throws(() => w.backup_apply(data));
		samePlan(plan(w), initial);
		assert.equal(stored(w), storageBefore);
		assert.equal(w.eval('JSON.stringify(wb_history)'), historyBefore);
	}
	const setter = w.Storage.prototype.setItem;
	w.Storage.prototype.setItem = () => { throw new Error('Quota exceeded'); };
	assert.throws(() => w.backup_apply(backup), /αποθήκευσης/);
	w.Storage.prototype.setItem = setter;
	samePlan(plan(w), initial);
	assert.equal(stored(w), storageBefore);
	console.log('ok: invalid imports and full storage leave current state untouched');

	const other = await page();
	other.backup_apply(backup);
	samePlan(plan(other), initial);
	assert.equal(other.eval('wb_history.past.length'), 0);
	assert.equal(other.document.forms[0].config.value, configText);
	assert.equal(other.eval('appStorage').getItem('config'), configText);
	assert.ok(other.document.querySelector('.day-list'));
	const reloaded = await page('https://example.test/championships/index.html', { ...other.localStorage });
	assert.ok(reloaded.document.querySelector('.saved-offer'));
	reloaded.document.querySelector('.saved-offer button').click();
	samePlan(plan(reloaded), initial);
	console.log('ok: complete JSON backup round-trip and saved championship offered on first load');

	// Exercise the actual buttons too, including the replacement confirmation.
	let exportedBlob;
	other.URL.createObjectURL = blob => { exportedBlob = blob; return 'blob:backup-test'; };
	other.URL.revokeObjectURL = () => {};
	const anchorClick = other.HTMLAnchorElement.prototype.click;
	other.HTMLAnchorElement.prototype.click = function () { assert.match(this.download, /^championship-.*\.json$/); };
	other.document.getElementById('backup-export').click();
	other.HTMLAnchorElement.prototype.click = anchorClick;
	const exportedText = await new Promise((resolve, reject) => {
		const reader = new other.FileReader();
		reader.onload = () => resolve(reader.result);
		reader.onerror = reject;
		reader.readAsText(exportedBlob);
	});
	assert.deepEqual(JSON.parse(exportedText), backup);
	const fileInput = other.document.getElementById('backup-file');
	let chooserOpened = false;
	fileInput.click = () => { chooserOpened = true; };
	other.document.getElementById('backup-import').click();
	assert.equal(chooserOpened, true);
	Object.defineProperty(fileInput, 'files', { value: [{ size: exportedText.length, text: async () => exportedText }] });
	other.wb_clear(keys[0]);
	const edited = plan(other);
	fileInput.dispatchEvent(new other.Event('change'));
	await new Promise(resolve => other.setTimeout(resolve, 0));
	assert.ok(other.document.querySelector('.ui-ask'));
	samePlan(plan(other), edited);
	other.document.querySelector('.ui-ask .button-quiet').click();
	samePlan(plan(other), edited);
	fileInput.dispatchEvent(new other.Event('change'));
	await new Promise(resolve => other.setTimeout(resolve, 0));
	other.document.querySelector('.ui-ask .button-danger').click();
	samePlan(plan(other), initial);
	console.log('ok: export downloads complete JSON; import opens chooser and requires confirmation before replacement');

	for (const legacy of [false, true]) {
		const url = legacy ? w.location.origin + w.location.pathname + '#p=' + w.share_encode(JSON.stringify(w.share_data(configText)))
			: await w.share_link('unsubmitted invalid draft');
		other.history.replaceState(null, '', url);
		const before = stored(other);
		other.share_open(await other.share_carried());
		samePlan(plan(other), initial);
		assert.equal(other.eval('JSON.stringify(config.sports.map(s => tiebreak_order(s)))'),
			w.eval('JSON.stringify(config.sports.map(s => tiebreak_order(s)))'), 'compressed and legacy links retain criterion order');
		assert.equal(other.eval('JSON.stringify(wb_standings(config.groups.pg))'),
			w.eval('JSON.stringify(wb_standings(config.groups.pg))'), 'shared ranks and explanations match the source');
		assert.equal(stored(other), before, 'viewing a link does not overwrite storage');
	}
	const lengths = new Set();
	for (let i = 0; i < 3; i++) {
		const data = { v: 2, c: configText + '\n#' + 'x'.repeat(i), p: [], r: {} };
		const zip = new w.JSZip();
		zip.file('p', JSON.stringify(data));
		const encoded = (await zip.generateAsync({ type: 'base64', compression: 'STORE' }))
			.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
		lengths.add(encoded.length % 4);
		other.history.replaceState(null, '', '#p=2.' + encoded);
		assert.equal(JSON.stringify(await other.share_carried()), JSON.stringify(data));
	}
	assert.deepEqual([...lengths].sort(), [0, 2, 3], 'links decode with zero, one or two omitted padding characters');
	other.history.replaceState(null, '', '#p=2.invalid');
	await assert.rejects(other.share_carried());
	console.log('ok: compressed and legacy links preserve every match, score and referee');

	const migrated = await page('https://example.test/championships/', {
		config: configText, workbook: JSON.stringify(backup.workbook), theme: 'dark',
		unrelated: 'keep me', 'championships:/championships/:theme': 'light',
	});
	assert.equal(migrated.eval('appStorage').getItem('config'), configText);
	assert.equal(migrated.eval('appStorage').getItem('theme'), 'light');
	assert.equal(migrated.localStorage.getItem('unrelated'), 'keep me');
	assert.equal(migrated.localStorage.getItem('config'), configText, 'legacy keys are not deleted');
	assert.ok(migrated.document.querySelector('.saved-offer'));
	const isolated = await page('https://example.test/another-project/', { ...w.localStorage });
	assert.equal(isolated.eval('appStorage').getItem('workbook'), null);
	assert.equal(w.document.querySelector('.sheet-tabs') && w.getComputedStyle(w.document.querySelector('.sheet-tabs')).overflowY, 'hidden');
	console.log('ok: legacy migration, namespaced values win, GitHub Pages projects isolated, vertical tab overflow hidden');

	Object.keys(w.eval('workbook.slots')).forEach(key => w.wb_clear(key));
	w.wb_history_reset();
	const empty = w.backup_data();
	other.backup_apply(empty);
	assert.equal(Object.keys(other.eval('workbook.slots')).length, 0, 'empty plans import too');
	other.backup_apply({ format: 'championships', version: 1, configuration: configText, workbook: null });
	assert.equal(other.document.querySelector('.day-list'), null);
	assert.equal(other.eval('appStorage').getItem('workbook'), null);
	console.log('ok: empty workbooks and configuration-only backups');

	const example = fs.readFileSync(path.join(ROOT, 'examples/input26g.txt'), 'utf8');
	w.parse_config(example);
	w.displayer(w.eval('config.days'));
	assert.deepEqual(['pg1', 'ps1', 'ps2', 'pf'].map(id => w.wb_display_id(id)), ['g1', 's1', 's2', 'f']);
	assert.deepEqual(['kg1', 'kb', 'ks1', 'kf'].map(id => w.wb_display_id(id)), ['g1', 'b', 's1', 'f']);
	const knockoutKey = w.share_slots()[0];
	w.wb_put(knockoutKey, 'ps1', null, null);
	w.sheets_draw();
	assert.equal(w.wb_plan_label(w.wb_at(knockoutKey)), 's1');
	assert.equal(w.document.querySelector('#sheet-plan [data-key="' + knockoutKey + '"]').textContent, 's1');
	assert.equal(w.wb_at(knockoutKey).kn, 'ps1', 'the stored ID is never renamed');
	assert.equal(w.wb_ident(w.wb_at(knockoutKey)), 'k:ps1', 'score identity remains unchanged');
	assert.equal(w.wb_sides(w.wb_at(knockoutKey)).home_label, '1η θέση ομίλου pg1');
	assert.equal(w.document.querySelector('#sheet-pages .pages-home-team').textContent, '1η θέση ομίλου pg1');
	assert.equal(w.wb_side_label({type: 'knockout', is_winner: false, knockout: {id: 'ps1'}}), 'Ηττημένος ps1');
	w.wb_put(knockoutKey, 'pf', null, null);
	w.sheets_draw();
	assert.equal(w.wb_sides(w.wb_at(knockoutKey)).home_label, 'Νικητής ps1');
	assert.equal(w.wb_sides(w.wb_at(knockoutKey)).away_label, 'Νικητής ps2');
	assert.equal(w.document.querySelector('#sheet-pages .pages-home-team').textContent, 'Νικητής ps1');
	assert.ok([...w.document.querySelectorAll('#sheet-points .points-team')].some(cell => cell.textContent === 'Νικητής ps1'));
	assert.equal(w.wb_plan_label(w.wb_at(knockoutKey)), 'f', 'compact plan labels remain unchanged');
	console.log('ok: clear winner, loser and group-position placeholders in match sheets and standings');
	assert.equal(w.getComputedStyle(w.document.querySelector('.pages-table thead th')).textTransform, 'none');
	assert.equal(w.getComputedStyle(w.document.querySelector('.points-sport-name')).textTransform, 'none');
	w.parse_config(example.replace(/\bpg1\b/g, 'xg1'));
	assert.equal(w.wb_display_id('ps1'), 'ps1', 'mixed group prefixes remain intact');
	assert.equal(w.wb_display_id('kf'), 'f', 'another sport is unaffected');
	w.parse_config(example.replace(/\bps1\b/g, 'xs1'));
	assert.equal(w.wb_display_id('pf'), 'pf', 'mixed knockout prefixes remain intact');
	w.parse_config(configText.replace('[groups]\npg Ποδόσφαιρο: 1v2, 1v2, 3v4\nbg Μπάσκετ: 1v3\n', '').replace('pg:1 pg:2', '1 2'));
	assert.equal(w.wb_display_id('pf'), 'pf', 'without group IDs there is no shared prefix to infer');
	assert.equal(w.excel_filename([{ date: new Date('2026-08-10T00:00:00Z') }]), 'champ26.xlsx');
	assert.equal(w.excel_filename([{ date: new Date('2006-08-10T00:00:00Z') }]), 'champ06.xlsx');
	assert.equal(w.excel_filename([{ date: new Date('2025-12-31T00:00:00Z') }, { date: new Date('2026-01-01T00:00:00Z') }]), 'champ25.xlsx');
	console.log('ok: conditional sport-prefix labels, stable IDs, sentence-case headings, and championship-year filenames');
	for (const page of [w, other, reloaded, migrated, isolated]) page.close();
})().catch(error => { console.error(error); process.exitCode = 1; });
