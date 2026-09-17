// Guided editing must preserve the legacy parser's meaning and the live workbook.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {JSDOM, VirtualConsole} = require('jsdom');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const sample = fs.readFileSync(path.join(ROOT, 'examples/input26g.txt'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
async function page(text) {
	const errors = [], vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(e.message));
	const dom = new JSDOM(html, {url: 'https://editor.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc});
	const w = dom.window;
	Object.defineProperty(w.document.forms[0], 'config', {value: w.document.getElementById('config-input')});
	w.alert = message => { throw Error(message); };
	if (text !== undefined) w.localStorage.setItem('championships:/:config', text);
	for (const match of html.matchAll(/<script(?: src="([^"]+)")?>([\s\S]*?)<\/script>/g)) {
		vm.runInContext(match[1] ? fs.readFileSync(path.join(ROOT, match[1].split('?')[0]), 'utf8') : match[2], dom.getInternalVMContext());
	}
	await new Promise(resolve => w.setTimeout(resolve, 0));
	const doc = w.document, input = doc.getElementById('config-input');
	const click = text => {
		const b = [...doc.querySelectorAll('button')].find(b => b.id === text || b.textContent.trim() === text || b.getAttribute('aria-label') === text);
		assert.ok(b, `button ${text} exists`); b.click();
	};
	const change = (node, value) => { assert.ok(node); node.focus(); node.value = value; node.dispatchEvent(new w.Event(node.tagName === 'SELECT' ? 'change' : 'input', {bubbles: true})); };
	const step = index => doc.querySelectorAll('.ce-step')[index].click();
	const read = () => plain(w.config_read_draft(input.value));
	return {w, doc, input, click, change, step, read, errors};
}
(async () => {
	const p = await page(), {w, doc, input, click, change, step, read} = p;
	assert.equal(doc.getElementById('config-guided').hidden, false);
	assert.deepEqual([...input.value.matchAll(/^\[(.+)\]$/gm)].map(m => m[1]), ['sports', 'zones', 'days', 'teams', 'groups', 'knockouts']);
	assert.deepEqual(read().sports.map(s => s.name), ['Ποδόσφαιρο', 'Μπάσκετ', 'Βόλεϊ', 'Μπέιζμπολ']);
	assert.deepEqual(read().sports.map(s => s.id), ['p', 'k', 'v', 'b']);
	assert.deepEqual(read().sports[0].courts, ['Π Ποδόσφαιρο', 'Κ Ποδόσφαιρο']);
	assert.deepEqual(read().sports[3].courts, ['Π Ποδόσφαιρο']);
	assert.equal(doc.querySelector('.ce-sports-grid datalist'), null, 'prefilled court names are ordinary editable text without suggestions');
	assert.ok([...doc.querySelectorAll('.ce-courts input')].every(input => !input.hasAttribute('list')));
	assert.deepEqual(read().zones, ['Πρωί', 'Απόγευμα']);
	assert.ok(!doc.querySelector('.ce-footer button')?.textContent.includes('Αρχή'), 'the first step has no permanently disabled back button');
	const firstScoring = doc.querySelector('.ce-sport .ce-details'); firstScoring.open = true;
	firstScoring.querySelector('.ce-select-trigger').click();
	assert.equal(firstScoring.querySelector('.ce-select-menu').hidden, false, 'guide dropdowns open a custom menu');
	assert.equal(firstScoring.querySelectorAll('.ce-select-option').length, 2);
	assert.equal(firstScoring.querySelector('.ce-select-option[aria-selected="true"]').textContent, 'Προεπιλογή αθλήματος (Νίκη 3 · Ισοπαλία 1 · Ήττα 0)');
	const scoringOrder = [...firstScoring.querySelectorAll('.ce-select-option')].map(option => option.textContent);
	firstScoring.querySelector('.ce-select-trigger').click(); firstScoring.querySelector('.ce-select-trigger').click();
	assert.deepEqual([...firstScoring.querySelectorAll('.ce-select-option')].map(option => option.textContent), scoringOrder, 'reopening a dropdown preserves its option order');
	step(4); assert.ok(![...doc.querySelectorAll('button')].some(button => button.textContent.includes('Μετάβαση στις ομάδες'))); step(0);
	let submissions = 0; doc.addEventListener('championships_config_parsed', () => submissions++);
	doc.forms[0].dispatchEvent(new w.Event('submit', {bubbles: true, cancelable: true}));
	assert.equal(submissions, 0); assert.ok(doc.querySelector('.ce-issues').textContent.includes('ημέρα'));
	console.log('ok: defaults, six text sections, and incomplete guided drafts do not start a search');

	// The importer uses the real parser, but preserves its object graph and signatures.
	w.parse_config(sample);
	const originalSports = w.eval('config.sports'), originalDays = w.eval('config.days'), signature = w.wb_signature();
	const files = fs.readdirSync(path.join(ROOT, 'examples')).filter(f => f.endsWith('.txt'));
	for (const file of [...files.map(f => 'examples/' + f), 'test/configs/unnamed-zone.txt']) {
		const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
		const draft = w.config_read_draft(text);
		assert.equal(w.eval('config.sports'), originalSports); assert.equal(w.eval('config.days'), originalDays);
		assert.equal(w.wb_signature(), signature);
		const again = w.config_read_draft(w.config_write_draft(draft));
		assert.deepEqual(plain(again), plain(draft), file + ' round trips without changing meaning');
		assert.equal(w.config_draft_issues(draft).length, 0, file + ' is editable');
	}
	assert.throws(() => w.config_read_draft('[sports]\nBad: '));
	assert.equal(w.eval('config.sports'), originalSports);
	console.log('ok: every historical sample and unnamed zones round-trip; parsing leaves the live configuration untouched');

	// An imported file remains byte-for-byte identical until a configuration edit.
	input.value = sample; w.config_editor_refresh();
	for (let i = 0; i < 7; i++) step(i);
	click('config-mode-text');
	assert.equal(input.value, sample); click('config-mode-guided'); assert.equal(input.value, sample);
	step(2);
	click('Επιλογή μήνα και έτους'); click('2027'); click('Ιανουάριος 2027');
	assert.equal(input.value, sample);
	change(doc.querySelector('.ce-bulk-rounds input'), '5'); assert.equal(input.value, sample);
	step(5); change(doc.querySelectorAll('.ce-bracket-builder select')[1], 'kg1'); assert.equal(input.value, sample);
	console.log('ok: mode switches, step navigation, month selection and bracket options preserve the original text');

	step(0);
	change(doc.querySelectorAll('.ce-sport input')[1], 'Football');
	assert.equal(read().groups[0].sport, 'Football'); assert.equal(read().knockouts[0].sport, 'Football');
	assert.equal(w.eval('config.sports'), originalSports, 'editing a draft does not change the championship');
	click('↶ Undo'); assert.equal(read().sports[0].name, 'Ποδόσφαιρο');
	click('+ Προσθήκη αθλήματος');
	click('↶ Undo'); assert.equal(read().sports.length, 4, 'focus after adding does not consume an undo');
	click('+ Προσθήκη αθλήματος');
	const last = doc.querySelector('.ce-sport:last-child'); change(last.querySelectorAll('input')[1], 'Handball'); change(last.querySelector('.ce-courts input'), 'Shared Court');
	assert.equal(read().sports.at(-1).name, 'Handball');
	click('Αφαίρεση αθλήματος Handball');
	step(1); const roundsBefore = read().days.map(d => d.rounds);
	click('Μετακίνηση ζώνης 1 κάτω'); assert.deepEqual(read().zones, ['Απόγευμα', 'Πρωί']);
	assert.deepEqual(read().days.map(d => d.rounds), roundsBefore.map(r => [...r].reverse()));
	click('↶ Undo');
	console.log('ok: sport renames update dependent stages, shared courts can be added, undo restores edits, zone order carries its rounds');

	// Invalid text never silently becomes a different guided configuration.
	click('config-mode-text'); input.value = '[sports]\nΠοδόσφαιρο: '; click('config-mode-guided');
	assert.equal(doc.getElementById('config-text').hidden, false); assert.equal(input.value, '[sports]\nΠοδόσφαιρο: ');
	assert.equal(doc.getElementById('config-feedback').hidden, false);
	input.value = sample; click('config-mode-guided');
	step(0); click('+ Προσθήκη αθλήματος'); const incomplete = input.value;
	click('config-mode-text'); click('config-mode-guided'); assert.equal(input.value, incomplete); assert.equal(doc.querySelectorAll('.ce-sport').length, 5);
	console.log('ok: invalid legacy input stays intact, and unfinished guided rows survive mode switches');

	input.value = sample; w.config_editor_refresh(); step(3);
	click('Αφαίρεση ομάδας 2'); assert.ok(doc.querySelector('.ui-ask')); click('Ακύρωση'); assert.equal(read().teams.length, 10);
	click('Αφαίρεση ομάδας 2'); click('Αφαίρεση');
	const fewer = read(); assert.equal(fewer.teams.length, 9); assert.equal(fewer.teams[1], '3η');
	assert.ok(fewer.groups.every(g => g.teams.every(n => n <= 9)));
	assert.ok(fewer.groups[0].matches.every(pair => pair.every(n => n <= 9)));
	click('↶ Undo'); assert.equal(read().teams.length, 10);
	change(doc.querySelector('.ce-bulk-teams textarea'), 'Eagles\nWolves'); click('Προσθήκη λίστας'); assert.deepEqual(read().teams.slice(-2), ['Eagles', 'Wolves']);
	console.log('ok: team removal is confirmed, IDs and explicit matches remap, bulk names receive consecutive IDs');

	input.value = sample; w.config_editor_refresh(); step(6);
	assert.equal(doc.querySelector('[data-count="6"]').textContent, '9', 'tiebreak navigation counts the selected sport rules, not sports');
	const labels = [...doc.querySelectorAll('.ce-rule-label strong')].map(n => n.textContent);
	assert.deepEqual(labels, ['Αποτελέσματα στους μεταξύ τους αγώνες', 'Διαφορά στους μεταξύ τους αγώνες', 'Υπέρ στους μεταξύ τους αγώνες', 'Λιγότερα κατά στους μεταξύ τους αγώνες', 'Συνολικές νίκες', 'Συνολική διαφορά', 'Συνολικά υπέρ', 'Λιγότερα συνολικά κατά', 'Μικρότερο ID ομάδας']);
	assert.equal(doc.querySelector('.ce-rule.is-final .ce-rule-label small').textContent, 'Η ομάδα με το μικρότερο αριθμητικά ID προκρίνεται.');
	click('Μετακίνηση κάτω: Αποτελέσματα στους μεταξύ τους αγώνες');
	assert.equal(read().sports[0].rules[1], 'μεταξύ_τους'); assert.equal(read().sports[1].customRules, false);
	assert.equal(doc.querySelector('.ce-rule:last-child').draggable, false);
	assert.equal(doc.querySelector('.ce-rule:last-child .ce-icon-button'), null);
	click('Απενεργοποίηση: Συνολικά υπέρ'); assert.ok(!read().sports[0].rules.includes('συνολικά_υπέρ'));
	assert.equal(doc.querySelector('[data-count="6"]').textContent, '8');
	click('+ Συνολικά υπέρ'); assert.equal(read().sports[0].rules.at(-2), 'συνολικά_υπέρ'); assert.equal(read().sports[0].rules.at(-1), 'id');
	assert.equal(doc.querySelector('[data-count="6"]').textContent, '9');
	// Drag-and-drop runs through the same ordered data, and is independent per sport.
	const items = doc.querySelectorAll('.ce-rule'), transfer = {setData() {}, effectAllowed: ''};
	const start = new w.Event('dragstart', {bubbles: true}); Object.defineProperty(start, 'dataTransfer', {value: transfer}); items[0].dispatchEvent(start);
	items[2].dispatchEvent(new w.Event('drop', {bubbles: true, cancelable: true}));
	assert.equal(read().sports[0].rules[2], 'μεταξύ_τους_διαφορά');
	click('Επαναφορά προεπιλεγμένης σειράς'); assert.equal(read().sports[0].customRules, false);
	change(doc.querySelector('.ce-final-rule select'), 'τυχαία'); assert.equal(read().sports[0].rules.at(-1), 'τυχαία'); assert.equal(read().sports[0].customRules, true);
	assert.equal(doc.querySelectorAll('.ce-rule.is-final').length, 1); assert.ok(!doc.querySelector('.ce-inactive-rules')?.textContent.includes('Μικρότερο ID ομάδας'));
	change(doc.querySelector('.ce-final-rule select'), 'επιλογή_χρήστη'); assert.equal(read().sports[0].rules.at(-1), 'επιλογή_χρήστη');
	assert.equal(doc.querySelectorAll('.ce-rule.is-final').length, 1);
	change(doc.querySelector('.ce-final-rule select'), 'id'); assert.equal(read().sports[0].customRules, false);
	assert.equal(w.config_repair_final_tiebreaks('[tiebreakers]\nΠοδόσφαιρο: συνολικές_νίκες, τυχαία, τυχαία'), '[tiebreakers]\nΠοδόσφαιρο: συνολικές_νίκες, τυχαία');
	console.log('ok: exact Greek labels, arrows and drag-and-drop, per-sport order, optional rules and fixed final ID');

	// Create a complete championship entirely through the new controls.
	input.value = ''; w.config_editor_refresh();
	step(2); click('Επόμενος μήνας');
	const dayButtons = doc.querySelectorAll('.ce-calendar-day'); dayButtons[0].click(); doc.querySelectorAll('.ce-calendar-day')[1].click();
	assert.equal(read().days.length, 2); assert.deepEqual(read().days[0].rounds, [1, 2]);
	const firstZoneRounds = doc.querySelector('.ce-day input[type="number"]'); let selectedRounds = false;
	firstZoneRounds.select = () => { selectedRounds = true; };
	firstZoneRounds.dispatchEvent(new w.MouseEvent('dblclick', {bubbles: true})); assert.equal(selectedRounds, true, 'double-click selects a day-zone round value');
	change(doc.querySelector('.ce-bulk-rounds input'), '0'); click('Εφαρμογή σε όλες'); assert.ok(read().days.every(d => d.rounds[0] === 0));
	change(doc.querySelector('.ce-day input'), '3'); assert.equal(read().days[0].rounds[0], 3);
	step(3); change(doc.querySelector('.ce-bulk-teams textarea'), 'One\nTwo\nThree\nFour'); click('Προσθήκη λίστας');
	step(4); click('+ Προσθήκη ομίλου');
	assert.equal(doc.querySelector('.ce-group .ce-label').textContent, 'ID ομίλου');
	assert.ok([...doc.querySelectorAll('.ce-team-choice input')].every(input => !input.checked), 'a new group starts without selected teams');
	click('Όλες'); assert.deepEqual(read().groups[0].teams, [1, 2, 3, 4]);
	const membership = doc.querySelector('.ce-team-choice input'); membership.focus(); membership.checked = false; membership.dispatchEvent(new w.Event('change', {bubbles: true}));
	assert.equal(doc.activeElement.id, 'ce-group-0-team-0', 'keyboard focus remains on the changed team checkbox');
	click('↶ Undo'); assert.deepEqual(read().groups[0].teams, [1, 2, 3, 4]);
	assert.equal(read().groups[0].count, 3); assert.deepEqual(read().groups[0].teams, [1, 2, 3, 4]);
	step(5); click('+ Δημιουργία τελικής φάσης');
	assert.equal(doc.querySelector('.ce-knockout .ce-label').textContent, 'ID αγώνα νοκ αουτ');
	assert.equal(read().knockouts.length, 3); assert.equal(read().knockouts[2].id, 'pf'); assert.equal(read().knockouts[2].home, 'ps1:W');
	assert.equal(w.config_draft_issues(w.config_read_draft(input.value)).length, 0);
	step(6); click('Έλεγχος διαμόρφωσης ✓'); assert.ok(doc.querySelector('.ce-issues.is-ready'));
	click('save'); assert.equal(w.eval("appStorage.getItem('config')"), input.value);
	const built = input.value; input.value = 'bad'; click('load'); assert.equal(input.value, built); assert.equal(doc.getElementById('config-guided').hidden, false);
	console.log('ok: calendar, per-zone rounds, bulk teams, round-robin groups and linked finals produce a valid saved configuration');

	// Changing group counts or removing a required field cannot erase a live plan.
	step(4); change(doc.querySelector('.ce-group select'), 'count'); change(doc.querySelector('.ce-group input[type="number"]'), '');
	const dayList = doc.createElement('div'); dayList.className = 'day-list'; doc.getElementById('program').append(dayList);
	doc.forms[0].dispatchEvent(new w.Event('submit', {bubbles: true, cancelable: true}));
	assert.equal(submissions, 0); assert.equal(doc.querySelector('.ui-ask'), null); assert.ok(doc.querySelector('.day-list'));
	assert.ok(doc.querySelector('.ce-issues').textContent.includes('θετικός ακέραιος'));
	assert.deepEqual(p.errors, []); w.close();

	// Legacy explicit matches, custom scoring and a shortened tiebreak order survive edits.
	const custom = sample.replace('Μπάσκετ\n', 'Μπάσκετ 4-2-1\n') + '\n[tiebreakers]\nΜπάσκετ: συνολικές_νίκες, id\n';
	const c = await page(custom);
	c.step(3); c.change(c.doc.querySelector('.ce-team input'), 'Renamed');
	assert.deepEqual(c.read().sports[1].points, ['4', '2', '1']); assert.deepEqual(c.read().sports[1].rules, ['συνολικές_νίκες', 'id']);
	assert.equal(c.read().groups[0].matches.length, 18);
	assert.deepEqual(c.errors, []); c.w.close();
	console.log('ok: incomplete edits cannot replace a live plan; legacy explicit matches, scoring and shortened rules remain compatible');
	const q = await page();
	assert.equal(q.doc.querySelector('.config-intro h3'), null);
	assert.equal(q.doc.querySelector('.config-modes small'), null);
	assert.equal(q.doc.querySelector('.ce-sport-icon'), null, 'sport cards have no decorative emoji');
	assert.equal(q.doc.querySelector('.ce-step-label small'), null, 'navigation shows only section names');
	q.step(1); assert.equal(q.doc.querySelector('.ce-heading').textContent, 'Ορίστε τις ζώνες κάθε ημέρας.');
	assert.equal(q.doc.querySelector('.ce-footer button').textContent, '← Αθλήματα'); assert.ok(q.doc.querySelector('.ce-footer button').classList.contains('button-primary'));
	q.step(2); assert.equal(q.doc.querySelector('.ce-heading').textContent, 'Ορίστε τις ημερομηνίες της κατασκήνωσης.');
	const pointer = (node, type) => {
		const event = new q.w.MouseEvent(type, {bubbles: true, cancelable: true, button: 0});
		Object.defineProperty(event, 'pointerId', {value: 1}); node.dispatchEvent(event);
	};
	const dragDays = (from, to, cancel = false) => {
		const before = q.input.value;
		const buttons = q.doc.querySelectorAll('.ce-calendar-day');
		pointer(buttons[from], 'pointerdown'); pointer(buttons[to], 'pointermove');
		assert.equal(q.input.value, before, 'preview does not commit before release');
		pointer(buttons[to], cancel ? 'pointercancel' : 'pointerup');
	};
	const originalCalendar = q.input.value;
	dragDays(1, 7); assert.equal(q.read().days.length, 7);
	const selectedCalendar = q.input.value;
	q.click('↶ Undo'); assert.equal(q.input.value, originalCalendar);
	q.click('↷ Redo'); assert.equal(q.input.value, selectedCalendar);
	dragDays(2, 5, true); assert.equal(q.input.value, selectedCalendar, 'cancelled drag restores the previous selection');
	dragDays(5, 2); assert.equal(q.read().days.length, 3, 'backward drag removes a selected range');
	q.click('↶ Undo'); assert.equal(q.input.value, selectedCalendar);
	q.click('Επιλογή μήνα και έτους'); q.click('2027'); q.click('Ιανουάριος 2027');
	assert.ok(q.doc.querySelector('.ce-month-trigger').textContent.includes('Ιανουάριος 2027'));
	assert.equal(q.input.value, selectedCalendar, 'month changes preserve the text and redo stack');
	assert.equal(q.doc.querySelector('.ce-redo').disabled, false);
	q.click('Επιλογή μήνα και έτους');
	const yearInput = q.doc.querySelector('.ce-month-picker input');
	yearInput.value = ''; yearInput.dispatchEvent(new q.w.Event('input', {bubbles: true}));
	assert.equal(yearInput.value, '', 'year entry can be cleared while typing');
	q.change(yearInput, '2032'); q.click('Φεβρουάριος 2032');
	assert.equal(q.doc.querySelectorAll('.ce-calendar-day').length, 29, 'typed year applies directly to the next month choice');
	assert.equal(q.input.value, selectedCalendar);
	q.doc.querySelector('.ce-calendar-day').click(); assert.equal(q.doc.querySelector('.ce-redo').disabled, true, 'a new edit replaces the redo branch');
	const afterNewDay = q.read(); q.click('↶ Undo'); q.click('↷ Redo'); assert.deepEqual(q.read(), afterNewDay);
	q.step(3); assert.equal(q.doc.querySelector('.ce-heading').textContent, 'Ορίστε τα ονόματα των ομάδων.');
	assert.ok(q.doc.querySelector('.ce-content').firstElementChild.classList.contains('ce-bulk-teams'), 'bulk team entry is first');
	assert.equal(q.doc.querySelector('.ce-bulk-teams textarea').placeholder, 'Ομολογητές\nΜαχητές\nΠιστοί\n...');
	assert.equal(q.doc.querySelector('.ce-individual-teams').tagName, 'SECTION');
	assert.deepEqual(q.errors, []); q.w.close();
	console.log('ok: requested copy, range selection/removal/cancellation, one-step undo/redo, month navigation and redo branching');

	const prefixes = await page(`[sports]\nΠοδόσφαιρο\nΜπάσκετ\nΒόλεϊ\nΜπέιζμπολ\n[zones]\nΠρωί\n[days]\n2026-08-10 2\n[teams]\nA\nB\nC\nD\n[groups]\n[knockouts]\n`);
	prefixes.step(4); prefixes.click('+ Προσθήκη ομίλου'); assert.equal(prefixes.doc.querySelector('.ce-group input').value, 'pg1');
	const teamChoices = prefixes.doc.querySelectorAll('.ce-team-choice');
	const beforeTeamDrag = prefixes.input.value;
	pointer(teamChoices[0], 'pointerdown'); pointer(teamChoices[1], 'pointermove');
	assert.equal(prefixes.input.value, beforeTeamDrag, 'team drag previews before committing');
	assert.deepEqual([...prefixes.doc.querySelectorAll('.ce-team-choice input')].map(input => input.checked), [true, true, false, false]);
	pointer(teamChoices[1], 'pointerup'); assert.deepEqual(prefixes.read().groups[0].teams, [1, 2]);
	prefixes.click('↶ Undo'); assert.ok([...prefixes.doc.querySelectorAll('.ce-team-choice input')].every(input => !input.checked)); prefixes.click('Όλες');
	for (const [sport, id] of [['Μπάσκετ', 'kg1'], ['Βόλεϊ', 'vg1'], ['Μπέιζμπολ', 'bg1']]) {
		prefixes.click(sport); prefixes.click('+ Προσθήκη ομίλου'); assert.equal(prefixes.doc.querySelector('.ce-group input').value, id); prefixes.click('Όλες');
	}
	assert.deepEqual(prefixes.errors, []); prefixes.w.close();
	console.log('ok: drag selection commits once and default sports receive their familiar group prefixes');

	const customId = await page(`[sports]\nΧάντμπολ @h\n[zones]\nΠρωί\n[days]\n2026-08-10 2\n[teams]\nA\nB\n[groups]\n[knockouts]\n`);
	customId.step(4); customId.click('+ Προσθήκη ομίλου'); assert.equal(customId.doc.querySelector('.ce-group input').value, 'hg1'); customId.click('Όλες');
	customId.step(5);
	assert.deepEqual([...customId.doc.querySelector('.ce-bracket-builder select').options].map(option => option.value), ['single'], 'one eligible group does not offer crossed groups');
	customId.click('+ Προσθήκη αγώνα νοκ άουτ'); assert.equal(customId.doc.querySelector('.ce-knockout input').value, 'hn1');
	assert.deepEqual(customId.errors, []); customId.w.close();

	const filtered = await page(`[sports]\nΠοδόσφαιρο\nΜπάσκετ\n[zones]\nΠρωί\n[days]\n2026-08-10 2\n[teams]\nA\nB\nC\nD\n[groups]\npg Ποδόσφαιρο 3: 1-4\nbg Μπάσκετ 3: 1-4\n[knockouts]\npf Ποδόσφαιρο 1 2\nbf Μπάσκετ 3 4\n`);
	filtered.step(4);
	assert.equal(filtered.doc.querySelector('[aria-label="Άθλημα ομίλων"] [aria-pressed="true"]').textContent, 'Ποδόσφαιρο');
	assert.deepEqual([...filtered.doc.querySelectorAll('.ce-group > .ce-row:first-child input')].map(input => input.value), ['pg']);
	filtered.click('Μπάσκετ'); assert.deepEqual([...filtered.doc.querySelectorAll('.ce-group > .ce-row:first-child input')].map(input => input.value), ['bg']);
	filtered.click('+ Προσθήκη ομίλου'); assert.equal(filtered.doc.querySelector('.ce-group:last-of-type input').value, 'kg1');
	[...filtered.doc.querySelector('.ce-group:last-of-type').querySelectorAll('button')].find(button => button.textContent === 'Όλες').click();
	filtered.step(5);
	assert.deepEqual([...filtered.doc.querySelectorAll('.ce-knockout input')].map(input => input.value), ['pf']);
	filtered.click('Μπάσκετ'); assert.deepEqual([...filtered.doc.querySelectorAll('.ce-knockout input')].map(input => input.value), ['bf']);
	filtered.click('+ Προσθήκη αγώνα νοκ άουτ');
	const addedKnockout = filtered.doc.querySelector('.ce-knockout:last-of-type'), addedOpponents = addedKnockout.querySelectorAll('select');
	filtered.change(addedOpponents[0], '1'); filtered.change(filtered.doc.querySelector('.ce-knockout:last-of-type').querySelectorAll('select')[1], '2');
	assert.equal(filtered.read().knockouts.at(-1).sport, 'Μπάσκετ');
	assert.equal(filtered.read().knockouts.at(-1).id, 'kn1');
	assert.deepEqual(filtered.errors, []); filtered.w.close();
	console.log('ok: groups and knockouts are filtered and created independently through the sport tabs');

	const crossed = await page(`[sports]\nΠοδόσφαιρο\nΜπάσκετ\n[zones]\nΠρωί\n[days]\n2026-08-10 2\n[teams]\nA\nB\nC\nD\nE\nF\nG\nH\n[groups]\npg1 Ποδόσφαιρο 3: 1-4\npg2 Ποδόσφαιρο 3: 5-8\nbg1 Μπάσκετ 3: 1-4\n[knockouts]\n`);
	crossed.step(5); assert.equal(crossed.doc.querySelector('.ce-heading').textContent, 'Ορίστε τους αγώνες νοκ αουτ.');
	assert.equal(crossed.doc.querySelector('.ce-bracket-builder select').value, 'cross', 'two groups default to qualifications from two groups');
	const builderSelects = crossed.doc.querySelectorAll('.ce-bracket-builder select');
	assert.ok(![...builderSelects[2].options].some(o => o.value === 'bg1'), 'crossovers only offer the other groups of the same sport');
	assert.ok(crossed.doc.querySelector('.ce-bracket-preview').textContent.includes('1η θέση · pg1  ↔  2η θέση · pg2'));
	assert.ok(crossed.doc.querySelector('.ce-bracket-preview').textContent.includes('2η θέση · pg1  ↔  1η θέση · pg2'));
	const beforeBracket = crossed.read(); crossed.doc.querySelector('.ce-bracket-builder input[type="checkbox"]').click();
	crossed.click('+ Δημιουργία τελικής φάσης');
	assert.deepEqual(crossed.read().knockouts.map(k => [k.id, k.home, k.away]), [['ps1', 'pg1:1', 'pg2:2'], ['ps2', 'pg1:2', 'pg2:1'], ['pf', 'ps1:W', 'ps2:W'], ['pb', 'ps1:L', 'ps2:L']]);
	const firstKnockout = crossed.doc.querySelector('.ce-knockout');
	assert.deepEqual([...firstKnockout.querySelectorAll('.ce-label')].slice(-2).map(label => label.textContent), ['Γηπεδούχος', 'Φιλοξενούμενη']);
	assert.deepEqual([...firstKnockout.querySelectorAll('select')[0].querySelectorAll('optgroup')].map(group => group.label), ['Θέση ομίλου', 'Συγκεκριμένη ομάδα']);
	const bracket = crossed.read(); crossed.click('↶ Undo'); assert.deepEqual(crossed.read(), beforeBracket);
	crossed.click('↷ Redo'); assert.deepEqual(crossed.read(), bracket);
	crossed.doc.querySelector('.ce-bracket-builder').open = true;
	crossed.change(crossed.doc.querySelectorAll('.ce-bracket-builder select')[1], 'pg2');
	assert.equal(crossed.doc.querySelector('.ce-bracket-builder').open, true, 'changing builder settings keeps it open when matches already exist');
	crossed.change(crossed.doc.querySelectorAll('.ce-bracket-builder select')[1], 'pg1');
	crossed.click('↶ Undo'); crossed.change(crossed.doc.querySelectorAll('.ce-bracket-builder select')[3], '4');
	crossed.click('+ Δημιουργία τελικής φάσης'); assert.equal(crossed.read().knockouts.length, 8, 'four qualifiers per group create quarterfinals, semis, final and bronze');
	assert.equal(crossed.w.config_draft_issues(crossed.w.config_read_draft(crossed.input.value)).length, 0);
	crossed.step(6); assert.equal(crossed.doc.querySelector('.ce-heading').textContent, 'Ορίστε τους κανόνες ισοβαθμιών.');
	assert.equal(crossed.doc.querySelector('.ce-fixed'), null); assert.equal(crossed.read().sports[0].rules.at(-1), 'id');
	crossed.input.value = sample; crossed.w.config_editor_refresh();
	assert.equal(crossed.doc.querySelector('.ce-undo').disabled, true); assert.equal(crossed.doc.querySelector('.ce-redo').disabled, true);
	assert.deepEqual(crossed.errors, []); crossed.w.close();
	console.log('ok: exact two-group crossovers, preview, same-sport filtering, linked finals and bronze, undo/redo of the whole bracket');
	console.log('all configuration editor checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
