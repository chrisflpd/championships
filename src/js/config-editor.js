/* Guided configuration is a draft. Only the existing submit handler changes the
 * running championship. Conversion uses the same parser, restoring its state
 * afterwards; simply visiting either editor never rewrites imported text. */
const CONFIG_SECTIONS = ['sports', 'zones', 'days', 'teams', 'groups', 'knockouts'];
const CONFIG_TEMPLATE = CONFIG_SECTIONS.map(name => `[${name}]\n`).join('\n') + '\n';
const CONFIG_STEPS = [
	['Αθλήματα', 'Γήπεδα & βαθμοί', 'Διαλέξτε τα αθλήματα του πρωταθλήματος.', 'Προσθέστε τα γήπεδα κάθε αθλήματος. Το ίδιο όνομα δηλώνει κοινό γήπεδο.'],
	['Ζώνες', 'Η ροή της ημέρας', 'Ορίστε τις ζώνες κάθε ημέρας.', 'Οι ζώνες παίζονται με τη σειρά που τις βλέπετε. Μπορείτε να τις μετονομάσετε ή να αλλάξετε τη σειρά τους.'],
	['Ημέρες', 'Ημερολόγιο & γύροι', 'Ορίστε τις ημερομηνίες της κατασκήνωσης.', 'Επιλέξτε ημέρες στο ημερολόγιο και ορίστε τους γύρους κάθε ζώνης. Το 0 σημαίνει ότι η ζώνη δεν χρησιμοποιείται εκείνη την ημέρα.'],
	['Ομάδες', 'Ονόματα & αριθμοί', 'Ορίστε τα ονόματα των ομάδων.', 'Γράψτε τα ονόματα των ομάδων. Τα ID συμπληρώνονται αυτόματα και χρησιμοποιούνται στους ομίλους και στα νοκ άουτ.'],
	['Όμιλοι', 'Συμμετοχές & αγώνες', 'Φτιάξτε τους ομίλους.', 'Επιλέξτε άθλημα παραπάνω και διαχειριστείτε μόνο τους ομίλους του. Παίξτε όλοι με όλους, ορίστε αγώνες ανά ομάδα ή διαλέξτε συγκεκριμένα ζευγάρια.'],
	['Νοκ άουτ', 'Προκρίσεις & τελικοί', 'Ορίστε τους αγώνες νοκ αουτ.', 'Επιλέξτε άθλημα παραπάνω και διαχειριστείτε μόνο τη δική του τελική φάση. Διαλέξτε ομάδες, θέσεις ομίλων ή αποτελέσματα προηγούμενων αγώνων.'],
	['Ισοβαθμίες', 'Η σειρά που μετράει', 'Κάθε ισοβαθμία, με ξεκάθαρους κανόνες.', 'Σύρετε τα κριτήρια ή χρησιμοποιήστε τα βέλη. Η σειρά εφαρμόζεται ξεχωριστά σε κάθε άθλημα, μετά τους βαθμούς κατάταξης.'],
];
const CONFIG_RULE_HELP = {
	'μεταξύ_τους': 'Για 2 ομάδες: περισσότερες μεταξύ τους νίκες. Για 3 ή περισσότερες: βαθμοί στον μεταξύ τους μικρό πίνακα.',
	'μεταξύ_τους_διαφορά': 'Υπέρ μείον κατά, μόνο στους αγώνες ανάμεσα στις ισόβαθμες ομάδες.',
	'μεταξύ_τους_υπέρ': 'Περισσότερα υπέρ στους αγώνες ανάμεσα στις ισόβαθμες ομάδες.',
	'μεταξύ_τους_κατά': 'Λιγότερα κατά στους αγώνες ανάμεσα στις ισόβαθμες ομάδες.',
	'συνολικές_νίκες': 'Περισσότερες νίκες σε όλους τους αγώνες του ομίλου.',
	'συνολική_διαφορά': 'Συνολικά υπέρ μείον συνολικά κατά σε όλους τους αγώνες του ομίλου.',
	'συνολικά_υπέρ': 'Περισσότερα υπέρ σε όλους τους αγώνες του ομίλου.',
	'συνολικά_κατά': 'Λιγότερα κατά σε όλους τους αγώνες του ομίλου.',
	'id': 'Τελικό κριτήριο για μοναδική τελική θέση κάθε ομάδας.',
};

function config_defaults() {
	return {
		sports: [
			{name: 'Ποδόσφαιρο', courts: ['Π Ποδόσφαιρο', 'Κ Ποδόσφαιρο'], points: null},
			{name: 'Μπάσκετ', courts: ['Μπάσκετ'], points: null},
			{name: 'Βόλεϊ', courts: ['Βόλεϊ'], points: null},
			{name: 'Μπέιζμπολ', courts: ['Π Ποδόσφαιρο'], points: null},
		].map(sport => ({...sport, rules: [...DEFAULT_TIEBREAK_ORDER], customRules: false})),
		zones: ['Πρωί', 'Απόγευμα'], days: [], teams: [], groups: [], knockouts: [], comments: [],
	};
}

function config_read_draft(text) {
	const old = {...config};
	try {
		parse_config(text);
		const points = new Map(), comments = [];
		let section = '';
		text.replace(/\r\n?/g, '\n').split('\n').forEach(line => {
			if (line.startsWith('#')) { comments.push(line); return; }
			if (/^\[.*\]$/.test(line)) { section = line.slice(1, -1).toLowerCase(); return; }
			if (!line.trim()) return;
			if (![...CONFIG_SECTIONS, 'tiebreakers'].includes(section))
				throw new Error('Υπάρχει κείμενο εκτός των γνωστών ενοτήτων. Κρατήστε το στην επεξεργασία κειμένου ή μεταφέρετέ το σε σχόλιο με #.');
			if (section === 'sports') {
				const match = line.match(/^\s*([^\s:,]+)(?:\s+(\d+)-(\d+)-(\d+))?/);
				points.set(match[1], match[2] === undefined ? null : match.slice(2, 5));
			}
		});
		const opponent = one => one.type === 'fixed' ? String(one.team.id)
			: one.type === 'group' ? `${one.group.id}:${one.rank}` : `${one.knockout.id}:${one.is_winner ? 'W' : 'L'}`;
		return {
			sports: config.sports.map(s => ({name: s.name, courts: [...s.courts], points: points.get(s.name), rules: [...tiebreak_order(s)], customRules: !!s.tiebreakers})),
			zones: config.zones.map(z => z.name),
			days: config.days.map(d => ({date: d.date.toISOString().slice(0, 10), rounds: d.dzones.map(z => z.rounds.length)})),
			teams: config.teams.map(t => t.name),
			groups: Object.values(config.groups).map(g => ({id: g.id, sport: g.sport.name, count: g.team_matches,
				mode: g.matches ? 'manual' : 'count', teams: g.teams.map(t => t.id), matches: g.matches?.map(m => [m.team_home.id, m.team_away.id]) || []})),
			knockouts: Object.values(config.knockouts).map(k => ({id: k.id, sport: k.sport.name, home: opponent(k.home), away: opponent(k.away)})), comments,
		};
	} finally {
		Object.keys(config).forEach(key => delete config[key]);
		Object.assign(config, old);
	}
}

function config_write_draft(draft) {
	const section = (name, lines) => `[${name}]\n${lines.join('\n')}\n`;
	const text = [
		section('sports', draft.sports.map(s => `${s.name}${s.points ? ' ' + s.points.join('-') : ''}${s.courts.length ? ': ' + s.courts.join(', ') : ''}`)),
		section('zones', draft.zones.filter(z => z !== null)),
		section('days', draft.days.map(d => `${d.date} ${d.rounds.join(' ')}`)),
		section('teams', draft.teams),
		section('groups', draft.groups.map(g => `${g.id} ${g.sport}${g.mode === 'manual' ? (g.count === null ? '' : ' ' + g.count) : ' ' + (g.mode === 'all' ? g.teams.length - 1 : g.count)}: ${g.mode === 'manual' ? g.matches.map(pair => pair.join('v')).join(', ') : g.teams.join(', ')}`)),
		section('knockouts', draft.knockouts.map(k => `${k.id} ${k.sport} ${k.home} ${k.away}`)),
	];
	const rules = draft.sports.filter(s => s.customRules);
	if (rules.length) text.push(section('tiebreakers', rules.map(s => `${s.name}: ${s.rules.join(', ')}`)));
	if (draft.comments.length) text.unshift(draft.comments.join('\n') + '\n');
	return text.join('\n');
}

function config_draft_issues(d) {
	const issues = [], add = (step, message) => issues.push({step, message});
	const word = value => typeof value === 'string' && /^[^\s:,#[\]]+$/.test(value);
	const name = value => typeof value === 'string' && value.trim() && !/[:,\r\n]/.test(value) && !/^[#[]/.test(value);
	const integer = (n, min) => String(n).trim() !== '' && Number.isSafeInteger(Number(n)) && Number(n) >= min;
	const duplicates = (items, step, label) => {
		const seen = new Set();
		items.forEach(item => {
			const normalized = String(item).trim().replace(/\s+/g, ' ');
			if (seen.has(normalized)) add(step, `${label}: το «${normalized}» υπάρχει ήδη.`);
			seen.add(normalized);
		});
	};
	if (!d.sports.length) add(0, 'Προσθέστε τουλάχιστον ένα άθλημα.');
	duplicates(d.sports.map(s => s.name), 0, 'Αθλήματα');
	d.sports.forEach((s, i) => {
		if (!word(s.name)) add(0, `Άθλημα ${i + 1}: συμπληρώστε ένα όνομα χωρίς κενά ή σημεία στίξης (: , # [ ]).`);
		if (!s.courts.length || s.courts.some(c => !name(c))) add(0, `${s.name || 'Άθλημα ' + (i + 1)}: συμπληρώστε τα ονόματα των γηπέδων, χωρίς : ή κόμμα.`);
		duplicates(s.courts, 0, s.name || 'Γήπεδα');
		if (s.points && s.points.some(n => !integer(n, 0))) add(0, `${s.name}: οι βαθμοί πρέπει να είναι ακέραιοι, από 0 και πάνω.`);
	});
	if (!d.zones.length) add(1, 'Προσθέστε τουλάχιστον μία ζώνη.');
	if (d.zones.some(z => z !== null && !name(z))) add(1, 'Συμπληρώστε ένα όνομα για κάθε ζώνη, χωρίς : ή κόμμα.');
	duplicates(d.zones, 1, 'Ζώνες');
	if (!d.days.length) add(2, 'Επιλέξτε τουλάχιστον μία ημέρα στο ημερολόγιο.');
	if (d.days.some(day => !/^\d{4}-\d{2}-\d{2}$/.test(day.date) || !Number.isFinite(Date.parse(day.date)) || new Date(day.date).toISOString().slice(0, 10) !== day.date)) add(2, 'Ελέγξτε τις ημερομηνίες.');
	if (d.days.some(day => day.rounds.length !== d.zones.length || day.rounds.some(n => !integer(n, 0)))) add(2, 'Συμπληρώστε ακέραιο αριθμό γύρων, από 0 και πάνω, για κάθε ημέρα και ζώνη.');
	if (d.days.length && !d.days.some(day => day.rounds.some(n => Number(n) > 0))) add(2, 'Χρειάζεται τουλάχιστον ένας διαθέσιμος γύρος.');
	if (d.teams.length < 2) add(3, 'Προσθέστε τουλάχιστον δύο ομάδες.');
	if (d.teams.some(t => !name(t))) add(3, 'Συμπληρώστε όλα τα ονόματα ομάδων, χωρίς : ή κόμμα.');
	duplicates(d.teams, 3, 'Ομάδες');
	const ids = new Set();
	[...d.groups, ...d.knockouts].forEach(g => {
		const step = d.groups.includes(g) ? 4 : 5;
		if (!word(g.id) || g.id in {}) add(step, 'Συμπληρώστε έγκυρο κωδικό χωρίς κενά (π.χ. g1 ή sf1).');
		if (ids.has(g.id)) add(step, `Ο κωδικός «${g.id}» χρησιμοποιείται ήδη. Κάθε όμιλος και νοκ άουτ χρειάζεται δικό του κωδικό.`);
		ids.add(g.id);
		if (!d.sports.some(s => s.name === g.sport)) add(step, `${g.id}: επιλέξτε άθλημα.`);
	});
	const validTeam = id => Number.isInteger(Number(id)) && Number(id) > 0 && Number(id) <= d.teams.length;
	d.groups.forEach(g => {
		if (g.mode === 'manual') {
			if (!g.matches.length) add(4, `${g.id}: προσθέστε τουλάχιστον έναν αγώνα.`);
			if (g.matches.some(pair => pair.some(t => !validTeam(t)) || Number(pair[0]) === Number(pair[1]))) add(4, `${g.id}: κάθε αγώνας χρειάζεται δύο διαφορετικές ομάδες.`);
		} else {
			if (g.teams.length < 2 || g.teams.some(t => !validTeam(t))) add(4, `${g.id}: επιλέξτε τουλάχιστον δύο ομάδες.`);
			const count = g.mode === 'all' ? g.teams.length - 1 : g.count;
			if (!integer(count, 1)) add(4, `${g.id}: ο αριθμός αγώνων ανά ομάδα πρέπει να είναι θετικός ακέραιος.`);
			else if (g.teams.length % 2 && Number(count) % 2) add(4, `${g.id}: με μονό αριθμό ομάδων, οι αγώνες ανά ομάδα πρέπει να είναι ζυγοί.`);
		}
	});
	d.knockouts.forEach((k, index) => {
		const options = config_opponents(d, k.sport, index).map(o => o.value);
		if (!options.includes(k.home) || !options.includes(k.away)) add(5, `${k.id}: επιλέξτε δύο έγκυρες πηγές ομάδων από το ίδιο άθλημα.`);
		else if (k.home === k.away) add(5, `${k.id}: οι δύο αντίπαλοι δεν μπορούν να έχουν την ίδια πηγή.`);
	});
	if (!d.groups.length && !d.knockouts.length) add(4, 'Προσθέστε τουλάχιστον έναν όμιλο ή έναν αγώνα νοκ άουτ.');
	return issues;
}

function config_group_teams(g) {
	return g.mode === 'manual' ? [...new Set(g.matches.flat().filter(Boolean).map(Number))] : g.teams;
}
function config_opponents(d, sport, before) {
	const options = d.teams.map((name, i) => ({value: String(i + 1), label: `#${i + 1} · ${name || 'Χωρίς όνομα'}`, group: 'Συγκεκριμένη ομάδα'}));
	d.groups.filter(g => g.sport === sport).forEach(g => {
		config_group_teams(g).forEach((_, rank) => options.push({value: `${g.id}:${rank + 1}`, label: `${rank + 1}η θέση · ${g.id}`, group: 'Θέση ομίλου'}));
	});
	d.knockouts.slice(0, before).filter(k => k.sport === sport).forEach(k => {
		options.push({value: `${k.id}:W`, label: `Νικητής · ${k.id}`, group: 'Προηγούμενος αγώνας'}, {value: `${k.id}:L`, label: `Ηττημένος · ${k.id}`, group: 'Προηγούμενος αγώνας'});
	});
	return options;
}

let config_editor = null;
// Called by load, backup and shared-link restoration, after their text is set.
function config_editor_refresh() {
	if (config_editor) config_editor.receive();
}

document.addEventListener('DOMContentLoaded', () => {
	const root = document.getElementById('config-guided');
	if (!root) return;
	const input = document.getElementById('config-input');
	const feedback = document.getElementById('config-feedback');
	let draft, mode = 'text', step = 0, source = null, showIssues = false, groupSport = 0, knockoutSport = 0, ruleSport = 0, dragRule = null;
	let month = new Date(); month = new Date(month.getFullYear(), month.getMonth(), 1);
	let bulkTeams = '', bulkRounds = [], bracketGroup = '', bracketSize = '4', bracketBronze = false, bracketMode = 'single', bracketOther = '', bracketQualifiers = '2';
	let fieldId = 0, history = [], future = [];
	let bracketOpen = null;
	let closeMonthPicker = () => {};
	const el = (tag, cls, text) => {
		const node = document.createElement(tag);
		if (cls) node.className = cls;
		if (text !== undefined) node.textContent = text;
		return node;
	};
	const button = (text, fn, cls = '') => {
		const b = el('button', 'button ' + cls, text); b.type = 'button'; b.addEventListener('click', fn); return b;
	};
	const say = (text, error = false) => {
		feedback.textContent = text; feedback.hidden = !text; feedback.className = error ? 'config-message is-error' : 'config-message';
	};
	const update = () => {
		say('');
		input.value = config_write_draft(draft); source = input.value;
		input.dispatchEvent(new Event('input', {bubbles: true}));
		updateOverview();
		if (showIssues) renderIssues();
	};
	const checkpoint = () => {
		const snapshot = JSON.stringify(draft);
		if (history.at(-1) !== snapshot) history.push(snapshot);
		if (history.length > 30) history.shift();
		future = [];
	};
	const travel = redo => {
		const from = redo ? future : history, to = redo ? history : future;
		if (!from.length) return;
		to.push(JSON.stringify(draft)); draft = JSON.parse(from.pop()); update(); render();
		root.querySelector(redo ? '.ce-redo' : '.ce-undo')?.focus({preventScroll: true});
	};
	const mutate = (fn, focus) => {
		const active = document.activeElement;
		const activeId = root.contains(active) ? active.id : '';
		const label = root.contains(active) ? active.getAttribute('aria-label') : null;
		const text = root.contains(active) && active.tagName === 'BUTTON' ? active.textContent : null;
		checkpoint(); fn(); update(); render();
		const target = focus ? root.querySelector(focus) : activeId ? document.getElementById(activeId)
			: [...root.querySelectorAll('button')].find(b => label ? b.getAttribute('aria-label') === label : text && b.textContent === text);
		if (target && !target.disabled) target.focus({preventScroll: true});
	};
	const field = (label, value, change, options = {}) => {
		const wrap = el('label', 'ce-field');
		wrap.append(el('span', 'ce-label', label));
		const control = el('input', 'ce-input');
		control.type = options.type || 'text'; control.value = value ?? ''; control.id = `ce-field-${++fieldId}`;
		if (options.placeholder) control.placeholder = options.placeholder;
		if (options.type === 'number') { control.min = options.min ?? 0; control.step = 1; control.inputMode = 'numeric'; }
		if (options.list) control.setAttribute('list', options.list);
		control.autocomplete = 'off';
		let editing = false;
		control.addEventListener('blur', () => { editing = false; });
		control.addEventListener('input', () => {
			if (options.draft !== false && !editing) { checkpoint(); editing = true; }
			change(control.value);
			if (options.draft !== false) update();
		});
		wrap.append(control);
		if (options.hint) wrap.append(el('small', 'ce-help', options.hint));
		return wrap;
	};
	const select = (label, value, options, change, viewOnly = false) => {
		const wrap = el('label', 'ce-field'); wrap.append(el('span', 'ce-label', label));
		const control = el('select', 'ce-input'); control.id = `ce-field-${++fieldId}`; let group = '', parent = control;
		options.forEach(option => {
			if (option.group && option.group !== group) { group = option.group; parent = el('optgroup'); parent.label = group; control.append(parent); }
			if (!option.group) parent = control;
			const node = el('option', '', option.label); node.value = option.value; parent.append(node);
		});
		control.value = value;
		control.addEventListener('change', () => {
			if (viewOnly) { const id = control.id; change(control.value); render(); document.getElementById(id)?.focus({preventScroll: true}); }
			else mutate(() => change(control.value));
		});
		wrap.append(control); return wrap;
	};
	const teamOptions = () => [{value: '', label: 'Επιλέξτε ομάδα'}, ...draft.teams.map((t, i) => ({value: String(i + 1), label: `#${i + 1} · ${t || 'Χωρίς όνομα'}`}))];
	const uniqueCode = prefix => {
		const ids = [...draft.groups, ...draft.knockouts].map(g => g.id);
		let n = 1; while (ids.includes(prefix + n)) n++; return prefix + n;
	};
	const empty = (parent, title, help) => { const box = el('div', 'ce-empty'); box.append(el('strong', '', title), el('p', '', help)); parent.append(box); };
	const row = (...children) => { const box = el('div', 'ce-row'); box.append(...children); return box; };
	const note = text => el('p', 'ce-note', text);
	const sportTabs = (selected, choose, label) => {
		const tabs = el('div', 'ce-sport-tabs'); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', label);
		draft.sports.forEach((sport, i) => {
			const b = button(sport.name || `Άθλημα ${i + 1}`, () => { choose(i); render(); });
			b.setAttribute('aria-pressed', String(i === selected)); tabs.append(b);
		});
		return tabs;
	};
	const remove = (label, fn) => { const b = button('×', fn, 'ce-remove'); b.setAttribute('aria-label', label); b.title = label; return b; };
	const renameRef = (old, value) => draft.knockouts.forEach(k => ['home', 'away'].forEach(side => {
		if (k[side].startsWith(old + ':')) k[side] = value + k[side].slice(old.length);
	}));
	const removeRefs = ids => {
		const removed = new Set(ids); let changed = true;
		while (changed) { changed = false; draft.knockouts.forEach(k => {
			if (!removed.has(k.id) && [k.home, k.away].some(ref => removed.has(ref.split(':')[0]))) { removed.add(k.id); changed = true; }
		}); }
		draft.knockouts = draft.knockouts.filter(k => !removed.has(k.id));
	};
	const confirmRemove = (title, body, fn) => ui_confirm({title, body: [body, 'Μπορείτε να επαναφέρετε την αλλαγή με «Undo».'], ok: 'Αφαίρεση', cancel: 'Ακύρωση'}, () => mutate(fn));
	const go = next => { step = next; render(); root.querySelector('.ce-heading')?.focus(); };

	function updateOverview() {
		if (!draft) return;
		const undo = root.querySelector('.ce-undo'); if (undo) undo.disabled = !history.length;
		const redo = root.querySelector('.ce-redo'); if (redo) redo.disabled = !future.length;
		root.querySelectorAll('.ce-sport').forEach((card, i) => {
			if (!draft.sports[i]) return;
			const b = card.querySelector('.ce-row > .ce-remove');
			if (b) { b.title = `Αφαίρεση αθλήματος ${draft.sports[i].name || i + 1}`; b.setAttribute('aria-label', b.title); }
		});
		const counts = [draft.sports.length, draft.zones.length, draft.days.length, draft.teams.length, draft.groups.length, draft.knockouts.length, draft.sports.length];
		root.querySelectorAll('[data-count]').forEach(node => { node.textContent = counts[Number(node.dataset.count)]; });
		const summary = root.querySelector('.ce-overview');
		if (summary) summary.textContent = `${draft.sports.length} αθλήματα · ${draft.teams.length} ομάδες · ${draft.days.length} ημέρες · ${draft.days.reduce((n, d) => n + d.rounds.reduce((s, r) => s + (Number(r) || 0), 0), 0)} γύροι`;
	}
	function render() {
		closeMonthPicker();
		const previousBracket = root.querySelector('.ce-bracket-builder');
		if (previousBracket) bracketOpen = previousBracket.open;
		root.replaceChildren(); fieldId = 0;
		const shell = el('div', 'ce-shell'), nav = el('nav', 'ce-nav'); nav.setAttribute('aria-label', 'Ενότητες διαμόρφωσης');
		nav.append(el('p', 'ce-nav-label', 'ΤΟ ΠΛΑΝΟ ΣΑΣ'));
		CONFIG_STEPS.forEach((one, i) => {
			const b = button('', () => go(i), 'ce-step'); b.classList.toggle('is-current', i === step);
			if (i === step) b.setAttribute('aria-current', 'step');
			const number = el('span', 'ce-step-number', String(i + 1).padStart(2, '0'));
			const label = el('span', 'ce-step-label'); label.append(el('strong', '', one[0]), el('small', '', one[1]));
			const count = el('span', 'ce-count'); count.dataset.count = i;
			b.append(number, label, count); nav.append(b);
		});
		const undo = button('↶ Undo', () => travel(false), 'button-quiet ce-undo');
		const redo = button('↷ Redo', () => travel(true), 'button-quiet ce-redo');
		undo.disabled = !history.length; redo.disabled = !future.length;
		const historyBar = el('div', 'ce-history'); historyBar.append(undo, redo); nav.append(historyBar);
		const main = el('section', 'ce-main');
		const head = el('div', 'ce-section-head');
		head.append(el('p', 'config-eyebrow', `ΒΗΜΑ ${step + 1} ΑΠΟ 7 · ${CONFIG_STEPS[step][0].toLocaleUpperCase('el')}`));
		const h = el('h3', 'ce-heading', CONFIG_STEPS[step][2]); h.tabIndex = -1; head.append(h, el('p', 'ce-description', CONFIG_STEPS[step][3])); main.append(head);
		const body = el('div', 'ce-content'); main.append(body);
		[renderSports, renderZones, renderDays, renderTeams, renderGroups, renderKnockouts, renderRules][step](body);
		const foot = el('div', 'ce-footer');
		const prev = button('← Πίσω', () => go(step - 1), 'button-quiet'); prev.disabled = step === 0;
		foot.append(prev, el('span', 'ce-overview'));
		foot.append(step === 6 ? button('Έλεγχος διαμόρφωσης ✓', validate, 'button-primary') : button(`${CONFIG_STEPS[step + 1][0]} →`, () => go(step + 1), 'button-primary'));
		main.append(foot); shell.append(nav, main); root.append(shell);
		if (showIssues) renderIssues(); updateOverview();
		// Keep the current section visible in the horizontally scrolling mobile nav.
		const current = nav.querySelector('.is-current');
		if (nav.scrollWidth > nav.clientWidth && current)
			nav.scrollLeft = current.offsetLeft - nav.offsetLeft - (nav.clientWidth - current.clientWidth) / 2;
	}
	function renderIssues() {
		root.querySelector('.ce-issues')?.remove();
		const issues = config_draft_issues(draft), box = el('div', 'ce-issues');
		box.setAttribute('role', 'status');
		if (!issues.length) { box.classList.add('is-ready'); box.append(el('strong', '', '✓ Η διαμόρφωση είναι έτοιμη.'), el('p', '', 'Πατήστε «Υποβολή» για να ξεκινήσει η δημιουργία προγράμματος.')); }
		else {
			box.append(el('strong', '', `${issues.length} ${issues.length === 1 ? 'σημείο χρειάζεται' : 'σημεία χρειάζονται'} συμπλήρωση`));
			const list = el('ul'); issues.forEach(issue => { const li = el('li'); li.append(button(issue.message, () => go(issue.step), 'ce-issue-link')); list.append(li); }); box.append(list);
		}
		root.append(box); return issues;
	}
	function validate() {
		showIssues = true; const issues = renderIssues();
		root.querySelector('.ce-issues')?.scrollIntoView?.({block: 'nearest', behavior: 'smooth'});
		return issues.length === 0;
	}

	function renderSports(body) {
		const list = el('div', 'ce-sports-grid');
		const suggestions = el('datalist'); suggestions.id = 'ce-courts';
		[...new Set(draft.sports.flatMap(s => s.courts).filter(Boolean))].forEach(c => { const o = el('option'); o.value = c; suggestions.append(o); });
		body.append(suggestions, list);
		draft.sports.forEach((s, index) => {
			const card = el('article', 'ce-card ce-sport'); card.style.setProperty('--ce-sport', `var(--sport-${index % 6 + 1})`);
			const emblem = el('span', 'ce-sport-icon', {'Ποδόσφαιρο': '⚽', 'Μπάσκετ': '🏀', 'Βόλεϊ': '🏐', 'Μπέιζμπολ': '⚾'}[s.name] || '◆'); emblem.setAttribute('aria-hidden', 'true');
			card.append(row(emblem, field('Όνομα αθλήματος', s.name, value => {
				const old = s.name; s.name = value;
				[...draft.groups, ...draft.knockouts].forEach(g => { if (g.sport === old) g.sport = value; });
			}), remove(`Αφαίρεση αθλήματος ${s.name || index + 1}`, () => {
				const dependent = [...draft.groups, ...draft.knockouts].filter(g => g.sport === s.name);
				const action = () => { removeRefs(dependent.map(g => g.id)); draft.groups = draft.groups.filter(g => g.sport !== s.name); draft.sports.splice(index, 1); };
				if (dependent.length) confirmRemove(`Αφαίρεση ${s.name};`, `Θα αφαιρεθούν επίσης ${dependent.length} σχετικοί όμιλοι / αγώνες νοκ άουτ και οι προκρίσεις που εξαρτώνται από αυτούς.`, action);
				else mutate(action);
			})));
			const courts = el('div', 'ce-courts');
			s.courts.forEach((c, ci) => {
				const shared = draft.sports.some(other => other !== s && other.courts.includes(c));
				const line = row(field(`Γήπεδο ${ci + 1}`, c, value => { s.courts[ci] = value; }, {list: 'ce-courts'}), remove(`Αφαίρεση γηπέδου ${c || ci + 1}`, () => mutate(() => s.courts.splice(ci, 1))));
				courts.append(line); if (shared) courts.append(el('small', 'ce-shared', '↔ Κοινό γήπεδο με άλλο άθλημα'));
			});
			courts.append(button('+ Προσθήκη γηπέδου', () => mutate(() => s.courts.push(''), `.ce-sport:nth-child(${index + 1}) .ce-courts .ce-row:last-of-type input`), 'ce-add-inline'));
			card.append(courts);
			const scoring = el('details', 'ce-details'); if (s.points) scoring.open = true;
			scoring.append(el('summary', '', 'Βαθμοί κατάταξης'));
			const standard = {
				'Ποδόσφαιρο': 'Νίκη 3 · Ισοπαλία 1 · Ήττα 0', 'Μπάσκετ': 'Νίκη 2 · Ήττα 1 · Χωρίς ισοπαλία',
				'Μπέιζμπολ': 'Νίκη 2 · Ήττα 1 · Χωρίς ισοπαλία', 'Βόλεϊ': 'Βαθμοί βάσει σετ, όπως στη Βαθμολογία. Χωρίς ισοπαλία.',
			}[s.name] || 'Νίκη 3 · Ισοπαλία 1 · Ήττα 0';
			scoring.append(note(standard));
			scoring.append(select('Τρόπος βαθμολόγησης', s.points ? 'custom' : 'default', [{value: 'default', label: 'Προεπιλογή αθλήματος'}, {value: 'custom', label: 'Δικοί μου βαθμοί νίκης / ισοπαλίας / ήττας'}], value => { s.points = value === 'custom' ? ['3', '1', '0'] : null; }));
			if (s.points) scoring.append(row(...['Νίκη', 'Ισοπαλία', 'Ήττα'].map((label, i) => field(label, s.points[i], value => s.points[i] = value, {type: 'number'}))));
			card.append(scoring); list.append(card);
		});
		if (!draft.sports.length) empty(body, 'Προσθέστε το πρώτο άθλημα', 'Μπορείτε να ορίσετε όσα αθλήματα και γήπεδα χρειάζεστε.');
		body.append(button('+ Προσθήκη αθλήματος', () => mutate(() => draft.sports.push({name: '', courts: [''], points: null, rules: [...DEFAULT_TIEBREAK_ORDER], customRules: false}), '.ce-sport:last-child input'), 'ce-add'));
	}
	function renderZones(body) {
		const list = el('div', 'ce-zone-list'); body.append(list);
		draft.zones.forEach((z, i) => {
			const card = el('div', 'ce-card ce-zone');
			const move = direction => mutate(() => {
				[draft.zones[i], draft.zones[i + direction]] = [draft.zones[i + direction], draft.zones[i]];
				draft.days.forEach(d => { [d.rounds[i], d.rounds[i + direction]] = [d.rounds[i + direction], d.rounds[i]]; });
			});
			const up = button('↑', () => move(-1), 'ce-icon-button'); up.disabled = i === 0; up.setAttribute('aria-label', `Μετακίνηση ζώνης ${i + 1} πάνω`);
			const down = button('↓', () => move(1), 'ce-icon-button'); down.disabled = i === draft.zones.length - 1; down.setAttribute('aria-label', `Μετακίνηση ζώνης ${i + 1} κάτω`);
			card.append(el('span', 'ce-zone-number', String(i + 1).padStart(2, '0')), field(`Ζώνη ${i + 1}`, z, value => draft.zones[i] = value, {placeholder: z === null ? 'Χωρίς όνομα (παλιά διαμόρφωση)' : 'π.χ. Βράδυ'}), up, down,
				remove(`Αφαίρεση ζώνης ${z || i + 1}`, () => {
					const action = () => { draft.zones.splice(i, 1); draft.days.forEach(d => d.rounds.splice(i, 1)); };
					if (draft.days.some(d => Number(d.rounds[i]) > 0)) confirmRemove('Αφαίρεση ζώνης;', `Θα αφαιρεθούν και οι γύροι της ζώνης «${z || 'Χωρίς όνομα'}» από τις επιλεγμένες ημέρες.`, action);
					else mutate(action);
				}));
			list.append(card);
		});
		body.append(button('+ Προσθήκη ζώνης', () => mutate(() => {
			if (draft.zones.includes(null)) draft.zones = draft.zones.map(z => z === null ? 'Ζώνη 1' : z);
			draft.zones.push(''); draft.days.forEach(d => d.rounds.push(0));
		}, '.ce-zone:last-child input'), 'ce-add'));
	}
	function dateISO(date) {
		return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
	}
	function monthControl() {
		const monthNames = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];
		const wrap = el('div', 'ce-field ce-month-control'); wrap.append(el('span', 'ce-label', 'Μήνας'));
		const title = `${monthNames[month.getMonth()]} ${month.getFullYear()}`;
		const trigger = button(title + ' ▾', () => popup.hidden ? open() : close(), 'ce-input ce-month-trigger');
		trigger.setAttribute('aria-label', 'Επιλογή μήνα και έτους'); trigger.setAttribute('aria-expanded', 'false'); trigger.setAttribute('aria-controls', 'ce-month-picker');
		const popup = el('div', 'ce-month-picker'); popup.id = 'ce-month-picker'; popup.hidden = true;
		popup.setAttribute('role', 'dialog'); popup.setAttribute('aria-label', 'Μήνας και έτος');
		let year = month.getFullYear();
		const close = (focus = false) => {
			popup.hidden = true; trigger.setAttribute('aria-expanded', 'false');
			document.removeEventListener('pointerdown', outside);
			if (focus) trigger.focus({preventScroll: true});
		};
		const outside = event => { if (!wrap.contains(event.target)) close(); };
		function drawPicker() {
			popup.replaceChildren();
			const yearField = field('Έτος', year, () => {}, {type: 'number', min: 1, draft: false});
			const yearInput = yearField.querySelector('input'); yearInput.max = 9999;
			const commitYear = (finish = false) => {
				if (/^\d{1,4}$/.test(yearInput.value) && Number(yearInput.value) > 0) {
					year = Number(yearInput.value);
					popup.querySelectorAll('.ce-month-choice').forEach((b, m) => {
						b.setAttribute('aria-label', monthNames[m] + ' ' + year);
						b.setAttribute('aria-pressed', String(m === month.getMonth() && year === month.getFullYear()));
					});
					popup.querySelectorAll('.ce-year-choice').forEach(b => b.setAttribute('aria-pressed', String(Number(b.textContent) === year)));
				}
				else if (finish) { yearInput.value = year; }
			};
			yearInput.addEventListener('input', () => commitYear());
			yearInput.addEventListener('change', () => commitYear(true));
			yearInput.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); commitYear(true); } });
			const done = button('×', () => close(true), 'ce-remove'); done.setAttribute('aria-label', 'Κλείσιμο επιλογής μήνα');
			popup.append(row(yearField, done));
			const columns = el('div', 'ce-month-columns'), years = el('div', 'ce-year-list'), months = el('div', 'ce-month-list');
			years.setAttribute('role', 'group'); years.setAttribute('aria-label', 'Έτη');
			months.setAttribute('role', 'group'); months.setAttribute('aria-label', 'Μήνες');
			for (let y = Math.max(1, year - 100); y <= Math.min(9999, year + 100); y++) {
				const b = button(String(y), () => { year = y; drawPicker(); popup.querySelector('.ce-year-list [aria-pressed="true"]')?.focus({preventScroll: true}); }, 'ce-year-choice');
				b.setAttribute('aria-pressed', String(y === year)); years.append(b);
			}
			for (let m = 0; m < 12; m++) {
				const name = new Date(2026, m, 1).toLocaleDateString('el-GR', {month: 'short'});
				const b = button(name, () => { month.setFullYear(year, m, 1); close(); render(); root.querySelector('.ce-month-trigger')?.focus({preventScroll: true}); }, 'ce-month-choice');
				b.setAttribute('aria-label', monthNames[m] + ' ' + year);
				b.setAttribute('aria-pressed', String(m === month.getMonth() && year === month.getFullYear())); months.append(b);
			}
			columns.append(years, months); popup.append(columns);
			popup.append(note('Κυλήστε τη λίστα ετών ή πληκτρολογήστε έτος. Έπειτα επιλέξτε μήνα.'));
			const selectedYear = years.querySelector('[aria-pressed="true"]');
			if (selectedYear) years.scrollTop = selectedYear.offsetTop - (years.clientHeight - selectedYear.clientHeight) / 2;
		}
		function open() {
			popup.hidden = false; trigger.setAttribute('aria-expanded', 'true'); drawPicker();
			document.addEventListener('pointerdown', outside);
			popup.querySelector('.ce-month-list [aria-pressed="true"]')?.focus({preventScroll: true});
			popup.scrollIntoView?.({block: 'nearest'});
		}
		wrap.addEventListener('keydown', event => {
			if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
		});
		wrap.addEventListener('focusout', event => { if (event.relatedTarget && !wrap.contains(event.relatedTarget)) close(); });
		closeMonthPicker = close;
		wrap.append(trigger, popup); return wrap;
	}
	function wireCalendarSelection(grid) {
		let drag = null;
		const existing = new Set(draft.days.map(d => d.date));
		const apply = (start, end, selected) => {
			const [first, last] = [start, end].sort();
			if (!selected) draft.days = draft.days.filter(d => d.date < first || d.date > last);
			else {
				const cursor = new Date(first + 'T12:00:00');
				while (dateISO(cursor) <= last) {
					const date = dateISO(cursor);
					if (!existing.has(date)) draft.days.push({date, rounds: draft.zones.map((_, i) => bulkRounds[i] ?? 2)});
					cursor.setDate(cursor.getDate() + 1);
				}
				draft.days.sort((a, b) => a.date.localeCompare(b.date));
			}
		};
		const preview = () => {
			const [first, last] = drag ? [drag.start, drag.end].sort() : ['', ''];
			grid.querySelectorAll('[data-date]').forEach(b => {
				const inside = drag && b.dataset.date >= first && b.dataset.date <= last;
				b.setAttribute('aria-pressed', String(inside ? drag.selected : existing.has(b.dataset.date)));
			});
		};
		grid.addEventListener('pointerdown', event => {
			const day = event.target.closest('[data-date]');
			if (!day || event.button !== 0 || drag) return;
			event.preventDefault(); day.focus({preventScroll: true});
			drag = {pointer: event.pointerId, start: day.dataset.date, end: day.dataset.date, selected: !existing.has(day.dataset.date)};
			grid.setPointerCapture?.(event.pointerId); preview();
		});
		grid.addEventListener('pointermove', event => {
			if (!drag || event.pointerId !== drag.pointer) return;
			const hit = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(event.clientX, event.clientY) : event.target;
			const day = hit?.closest('[data-date]');
			if (day && grid.contains(day)) { drag.end = day.dataset.date; preview(); }
		});
		const finish = (event, cancel = false) => {
			if (!drag || (event.pointerId !== undefined && event.pointerId !== drag.pointer)) return;
			const gesture = drag; drag = null;
			if (grid.hasPointerCapture?.(gesture.pointer)) grid.releasePointerCapture(gesture.pointer);
			if (cancel) { preview(); return; }
			mutate(() => apply(gesture.start, gesture.end, gesture.selected), `[data-date="${gesture.end}"]`);
		};
		grid.addEventListener('pointerup', event => finish(event));
		grid.addEventListener('pointercancel', event => finish(event, true));
		grid.addEventListener('lostpointercapture', event => finish(event, true));
		grid.addEventListener('keydown', event => {
			if (event.key === 'Escape' && drag) { event.preventDefault(); finish(event, true); }
		});
		grid.addEventListener('click', event => {
			// Pointer gestures are committed once on release; keyboard/assistive clicks
			// still toggle a day, without adding another history entry for a drag.
			const day = event.target.closest('[data-date]');
			if (!day) return;
			event.preventDefault();
			if (event.detail === 0) mutate(() => apply(day.dataset.date, day.dataset.date, !existing.has(day.dataset.date)), `[data-date="${day.dataset.date}"]`);
		});
	}
	function renderDays(body) {
		if (!draft.zones.length) { empty(body, 'Πρώτα, προσθέστε μία ζώνη.', 'Οι γύροι κάθε ημέρας αντιστοιχούν στις ζώνες του πρωταθλήματος.'); body.append(button('Μετάβαση στις ζώνες →', () => go(1))); return; }
		const layout = el('div', 'ce-calendar-layout'), calendar = el('div', 'ce-card ce-calendar');
		const prev = button('‹', () => { month.setMonth(month.getMonth() - 1); render(); root.querySelector('[aria-label="Προηγούμενος μήνας"]')?.focus({preventScroll: true}); }, 'ce-icon-button'); prev.setAttribute('aria-label', 'Προηγούμενος μήνας');
		const next = button('›', () => { month.setMonth(month.getMonth() + 1); render(); root.querySelector('[aria-label="Επόμενος μήνας"]')?.focus({preventScroll: true}); }, 'ce-icon-button'); next.setAttribute('aria-label', 'Επόμενος μήνας');
		prev.disabled = month.getFullYear() === 1 && month.getMonth() === 0;
		next.disabled = month.getFullYear() === 9999 && month.getMonth() === 11;
		calendar.append(row(prev, monthControl(), next));
		const grid = el('div', 'ce-calendar-grid'); grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', 'Επιλογή ημερών');
		['Δε', 'Τρ', 'Τε', 'Πε', 'Πα', 'Σα', 'Κυ'].forEach(day => grid.append(el('span', 'ce-weekday', day)));
		const offset = (month.getDay() + 6) % 7, today = dateISO(new Date());
		const endOfMonth = new Date(month); endOfMonth.setMonth(month.getMonth() + 1, 0);
		const days = endOfMonth.getDate();
		for (let i = 0; i < offset; i++) grid.append(el('span', 'ce-calendar-spacer'));
		for (let day = 1; day <= days; day++) {
			const date = new Date(month); date.setDate(day);
			const iso = dateISO(date), selected = draft.days.some(d => d.date === iso);
			const b = button(String(day), () => {}, 'ce-calendar-day'); b.dataset.date = iso;
			b.setAttribute('aria-label', date.toLocaleDateString('el-GR', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'}));
			b.setAttribute('aria-pressed', String(selected)); if (today === iso) b.setAttribute('aria-current', 'date'); grid.append(b);
		}
		wireCalendarSelection(grid);
		const legend = note(''); const dot = el('span', 'ce-selected-dot', '●'); dot.setAttribute('aria-hidden', 'true');
		legend.append(dot, document.createTextNode(' Επιλεγμένη ημέρα · Πατήστε ή σύρετε για επιλογή / αφαίρεση ημερών.'));
		calendar.append(grid, legend);
		const bulk = el('div', 'ce-bulk-rounds'); bulk.append(el('h4', '', 'Γύροι για όλες τις ημέρες'));
		draft.zones.forEach((z, i) => {
			const f = field(z || 'Ζώνη', bulkRounds[i] ?? 2, value => { bulkRounds[i] = value; }, {type: 'number', draft: false});
			bulk.append(f);
		});
		bulk.append(button('Εφαρμογή σε όλες', () => {
			if (draft.zones.some((_, i) => !/^\d+$/.test(String(bulkRounds[i] ?? 2)))) { say('Οι γύροι πρέπει να είναι ακέραιοι, από 0 και πάνω.', true); return; }
			mutate(() => draft.days.forEach(d => { d.rounds = draft.zones.map((_, i) => bulkRounds[i] ?? 2); })); say('Οι γύροι εφαρμόστηκαν σε όλες τις επιλεγμένες ημέρες.');
		}, 'ce-add-inline')); calendar.append(bulk);
		const selected = el('div', 'ce-selected-days'); selected.append(el('h4', '', `Επιλεγμένες ημέρες (${draft.days.length})`));
		if (!draft.days.length) empty(selected, 'Το ημερολόγιό σας είναι ανοιχτό.', 'Πατήστε όσες ημέρες θέλετε. Μπορείτε να επιλέξετε ημέρες από διαφορετικούς μήνες.');
		draft.days.forEach((d, index) => {
			const card = el('div', 'ce-card ce-day');
			const date = new Date(d.date + 'T12:00:00'), label = date.toLocaleDateString('el-GR', {weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'});
			card.append(row(el('strong', 'ce-day-title', label), remove(`Αφαίρεση ημέρας ${d.date}`, () => mutate(() => draft.days.splice(index, 1)))));
			card.append(row(...draft.zones.map((z, i) => field(z || 'Ζώνη', d.rounds[i], value => d.rounds[i] = value, {type: 'number'})))); selected.append(card);
		});
		layout.append(calendar, selected); body.append(layout);
	}
	function renderTeams(body) {
		const list = el('div', 'ce-teams-grid'); body.append(list);
		draft.teams.forEach((name, i) => {
			const card = el('div', 'ce-team');
			card.append(el('span', 'ce-team-id', `#${i + 1}`), field(`Ομάδα ${i + 1}`, name, value => draft.teams[i] = value, {placeholder: 'Όνομα ομάδας'}), remove(`Αφαίρεση ομάδας ${i + 1}`, () => {
				const id = i + 1;
				const used = draft.groups.some(g => config_group_teams(g).includes(id)) || draft.knockouts.some(k => k.home === String(id) || k.away === String(id));
				const action = () => {
					draft.teams.splice(i, 1); const remap = n => Number(n) > id ? Number(n) - 1 : Number(n);
					draft.groups.forEach(g => { g.teams = g.teams.filter(n => n !== id).map(remap); g.matches = g.matches.filter(pair => !pair.includes(id)).map(pair => pair.map(remap)); });
					draft.knockouts.forEach(k => ['home', 'away'].forEach(side => { if (k[side] === String(id)) k[side] = ''; else if (/^\d+$/.test(k[side])) k[side] = String(remap(k[side])); }));
				};
				if (used) confirmRemove(`Αφαίρεση ομάδας #${id};`, 'Η ομάδα θα αφαιρεθεί από τους ομίλους και τα συγκεκριμένα ζευγάρια της. Οι απευθείας θέσεις της στα νοκ άουτ θα αδειάσουν. Τα υπόλοιπα ID και οι αναφορές τους ενημερώνονται αυτόματα.', action);
				else mutate(action);
			}));
			list.append(card);
		});
		if (!draft.teams.length) empty(body, 'Η πρώτη ομάδα περιμένει το όνομά της.', 'Προσθέστε ομάδες μία μία ή επικολλήστε ολόκληρη τη λίστα παρακάτω.');
		body.append(button('+ Προσθήκη ομάδας', () => mutate(() => draft.teams.push(''), '.ce-team:last-child input'), 'ce-add'));
		const bulk = el('details', 'ce-details ce-bulk-teams'); bulk.open = !draft.teams.length;
		bulk.append(el('summary', '', 'Προσθήκη πολλών ομάδων μαζί'));
		const label = el('label', 'ce-field'); label.append(el('span', 'ce-label', 'Ένα όνομα σε κάθε γραμμή'));
		const names = el('textarea', 'ce-input'); names.rows = 4; names.value = bulkTeams; names.placeholder = 'π.χ. Ομολογητές\nΜαχητές\nΠιστοί\n...'; names.addEventListener('input', () => bulkTeams = names.value); label.append(names); bulk.append(label);
		bulk.append(button('Προσθήκη λίστας', () => {
			const values = bulkTeams.split(/\r?\n/).map(t => t.trim().replace(/\s+/g, ' ')).filter(Boolean);
			if (!values.length) { say('Γράψτε τουλάχιστον ένα όνομα ομάδας.', true); return; }
			const combined = [...draft.teams, ...values].map(t => t.trim().replace(/\s+/g, ' '));
			if (new Set(combined).size !== combined.length || values.some(t => /[:,]/.test(t) || /^[#[]/.test(t))) { say('Χρησιμοποιήστε διαφορετικά ονόματα ομάδων, χωρίς : ή κόμμα και χωρίς # ή [ στην αρχή.', true); return; }
			mutate(() => { draft.teams.push(...values); bulkTeams = ''; }); say(`Προστέθηκαν ${values.length} ομάδες με αυτόματα ID.`);
		}, 'ce-add-inline')); body.append(bulk);
	}

	function renderGroups(body) {
		if (!draft.sports.length) { empty(body, 'Χρειάζεται τουλάχιστον ένα άθλημα.', 'Προσθέστε ένα άθλημα πριν φτιάξετε ομίλους.'); return; }
		groupSport = Math.min(groupSport, draft.sports.length - 1);
		body.append(sportTabs(groupSport, value => groupSport = value, 'Άθλημα ομίλων'));
		if (draft.teams.length < 2) { empty(body, 'Χρειάζονται τουλάχιστον δύο ομάδες.', 'Προσθέστε ομάδες για να φτιάξετε όμιλο στο επιλεγμένο άθλημα.'); body.append(button('Μετάβαση στις ομάδες →', () => go(3))); return; }
		const sport = draft.sports[groupSport], groups = draft.groups.map((g, index) => ({g, index})).filter(one => one.g.sport === sport.name);
		if (!groups.length) empty(body, `Δεν υπάρχουν ακόμη όμιλοι για ${sport.name}.`, 'Προσθέστε τον πρώτο όμιλο για αυτό το άθλημα ή επιλέξτε άλλο άθλημα παραπάνω.');
		groups.forEach(({g, index}) => {
			const card = el('article', 'ce-card ce-group');
			const head = row(field('Κωδικός ομίλου', g.id, value => { const old = g.id; g.id = value; renameRef(old, value); }),
				remove(`Αφαίρεση ομίλου ${g.id}`, () => {
					const action = () => { draft.groups.splice(index, 1); removeRefs([g.id]); };
					if (draft.knockouts.some(k => [k.home, k.away].some(ref => ref.startsWith(g.id + ':')))) confirmRemove(`Αφαίρεση ομίλου ${g.id};`, 'Θα αφαιρεθούν και οι αγώνες νοκ άουτ που εξαρτώνται από αυτόν τον όμιλο, μαζί με τις επόμενες προκρίσεις τους.', action);
					else mutate(action);
				})); card.append(head);
			card.append(select('Αγώνες ομίλου', g.mode, [
				{value: 'all', label: 'Όλοι με όλους · ένας αγώνας με κάθε αντίπαλο'}, {value: 'count', label: 'Συγκεκριμένος αριθμός αγώνων ανά ομάδα'}, {value: 'manual', label: 'Συγκεκριμένα ζευγάρια αγώνων'},
			], value => {
				if (g.mode === 'manual') g.teams = config_group_teams(g);
				g.mode = value;
				if (value === 'manual') { g.count = null; if (!g.matches.length) g.matches.push([g.teams[0] || 1, g.teams[1] || 2]); }
				if (value === 'count' && !g.count) g.count = Math.max(1, g.teams.length - 1);
			}));
			if (g.mode !== 'manual') {
				const tools = row(el('strong', '', `Ομάδες στον όμιλο (${g.teams.length})`), button('Όλες', () => mutate(() => { g.teams = draft.teams.map((_, i) => i + 1); }), 'ce-add-inline'), button('Καμία', () => mutate(() => { g.teams = []; }), 'ce-add-inline'));
				card.append(tools); const choices = el('div', 'ce-team-choices');
				draft.teams.forEach((t, i) => {
					const label = el('label', 'ce-team-choice'), check = el('input'); check.type = 'checkbox'; check.id = `ce-group-${index}-team-${i}`; check.checked = g.teams.includes(i + 1);
					check.addEventListener('change', () => mutate(() => { if (check.checked) g.teams.push(i + 1); else g.teams = g.teams.filter(n => n !== i + 1); }));
					label.append(check, el('span', 'ce-team-id', `#${i + 1}`), el('span', '', t || 'Χωρίς όνομα')); choices.append(label);
				}); card.append(choices);
				if (g.mode === 'count') card.append(field('Αγώνες ανά ομάδα', g.count, value => g.count = value, {type: 'number', min: 1, hint: 'Με μονό αριθμό ομάδων χρειάζεται ζυγός αριθμός αγώνων ανά ομάδα.'}));
				else card.append(note(`${g.teams.length} ομάδες · ${Math.max(0, g.teams.length - 1)} αγώνες ανά ομάδα · ${g.teams.length * Math.max(0, g.teams.length - 1) / 2} αγώνες συνολικά`));
			} else {
				g.matches.forEach((pair, i) => card.append(row(el('span', 'ce-match-number', String(i + 1)), select('Γηπεδούχος', String(pair[0] || ''), teamOptions(), value => pair[0] = Number(value) || ''), el('span', 'ce-vs', 'vs'), select('Φιλοξενούμενος', String(pair[1] || ''), teamOptions(), value => pair[1] = Number(value) || ''), remove(`Αφαίρεση ζευγαριού ${i + 1}`, () => mutate(() => g.matches.splice(i, 1))))));
				card.append(button('+ Προσθήκη ζευγαριού', () => mutate(() => g.matches.push(['', ''])), 'ce-add-inline'));
			}
			body.append(card);
		});
		body.append(button('+ Προσθήκη ομίλου', () => mutate(() => draft.groups.push({id: uniqueCode('g'), sport: sport.name, mode: 'all', count: 1, teams: draft.teams.map((_, i) => i + 1), matches: []}), '.ce-group:last-of-type input'), 'ce-add'));
	}
	function renderKnockouts(body) {
		if (!draft.sports.length) { empty(body, 'Χρειάζεται τουλάχιστον ένα άθλημα.', 'Προσθέστε ένα άθλημα πριν φτιάξετε αγώνες νοκ άουτ.'); return; }
		knockoutSport = Math.min(knockoutSport, draft.sports.length - 1);
		body.append(sportTabs(knockoutSport, value => knockoutSport = value, 'Άθλημα νοκ άουτ'));
		if (draft.teams.length < 2) { empty(body, 'Πρώτα, προσθέστε τουλάχιστον δύο ομάδες.', 'Οι αγώνες νοκ άουτ μπορούν να χρησιμοποιούν και απευθείας ομάδες, χωρίς ομίλους.'); return; }
		const sport = draft.sports[knockoutSport];
		const eligible = draft.groups.filter(g => g.sport === sport.name && config_group_teams(g).length >= 2);
		if (eligible.length) {
			const quick = el('details', 'ce-details ce-bracket-builder'); quick.open = bracketOpen ?? !draft.knockouts.length; quick.append(el('summary', '', 'Γρήγορη δημιουργία τελικής φάσης'));
			if (!eligible.some(g => g.id === bracketGroup)) bracketGroup = eligible[0].id;
			quick.append(select('Προκρίσεις από', bracketMode, [
				{value: 'single', label: 'Έναν όμιλο'}, {value: 'cross', label: 'Δύο ομίλους · χιαστί'},
			], value => bracketMode = value, true));
			const group = eligible.find(g => g.id === bracketGroup);
			const others = eligible.filter(g => g.id !== group.id && g.sport === group.sport);
			if (!others.some(g => g.id === bracketOther)) bracketOther = others[0]?.id || '';
			quick.append(select(bracketMode === 'single' ? 'Όμιλος πρόκρισης' : 'Πρώτος όμιλος', bracketGroup,
				eligible.map(g => ({value: g.id, label: `${g.id} · ${g.sport}`})), value => bracketGroup = value, true));
			let sources;
			if (bracketMode === 'cross') {
				quick.append(row(select('Δεύτερος όμιλος', bracketOther, [{value: '', label: 'Επιλέξτε όμιλο του ίδιου αθλήματος'},
					...others.map(g => ({value: g.id, label: `${g.id} · ${g.sport}`}))], value => bracketOther = value, true),
					select('Ομάδες που προκρίνονται από κάθε όμιλο', bracketQualifiers, [
						{value: '1', label: '1 + 1 · τελικός'}, {value: '2', label: '2 + 2 · ημιτελικοί + τελικός'},
						{value: '4', label: '4 + 4 · προημιτελικοί + ημιτελικοί + τελικός'},
					], value => bracketQualifiers = value, true)));
				const count = Number(bracketQualifiers), order = count === 4 ? [1, 3, 2, 4] : count === 2 ? [1, 2] : [1];
				sources = order.flatMap(rank => [`${group.id}:${rank}`, `${bracketOther}:${count + 1 - rank}`]);
				quick.append(note(bracketOther ? `Προκρίνονται ${count} ομάδες από τον ${group.id} και ${count} από τον ${bracketOther}. Ο πρώτος κάθε ομίλου παίζει με τον τελευταίο προκρινόμενο του άλλου.` : 'Προσθέστε δεύτερο όμιλο στο ίδιο άθλημα για χιαστί αγώνες.'));
			} else {
				quick.append(select('Τελική φάση', bracketSize, [{value: '2', label: '2 ομάδες · τελικός'}, {value: '4', label: '4 ομάδες · ημιτελικοί + τελικός'}, {value: '8', label: '8 ομάδες · προημιτελικοί + ημιτελικοί + τελικός'}], value => bracketSize = value, true));
				const size = Number(bracketSize), seeds = size === 8 ? [1, 8, 4, 5, 2, 7, 3, 6] : size === 4 ? [1, 4, 2, 3] : [1, 2];
				sources = seeds.map(n => `${group.id}:${n}`);
			}
			if (bracketMode === 'single' || bracketOther) {
				const preview = el('div', 'ce-bracket-preview'); preview.append(el('h4', '', 'Πρώτος γύρος'));
				for (let i = 0; i < sources.length; i += 2) {
					const label = ref => { const [id, rank] = ref.split(':'); return `${rank}η θέση · ${id}`; };
					preview.append(el('p', '', `${label(sources[i])}  ↔  ${label(sources[i + 1])}`));
				}
				quick.append(preview);
			}
			if (sources.length > 2) {
				const label = el('label', 'ce-check'), check = el('input'); check.type = 'checkbox'; check.checked = bracketBronze; check.addEventListener('change', () => bracketBronze = check.checked); label.append(check, el('span', '', 'Προσθήκη μικρού τελικού')); quick.append(label);
			}
			quick.append(note('Οι αγώνες προστίθενται παρακάτω και μπορείτε να αλλάξετε κάθε ζευγάρι.'));
			quick.append(button('+ Δημιουργία τελικής φάσης', () => {
				const count = bracketMode === 'cross' ? Number(bracketQualifiers) : Number(bracketSize);
				const other = others.find(g => g.id === bracketOther);
				if (bracketMode === 'cross' && !other) { say('Επιλέξτε δύο διαφορετικούς ομίλους του ίδιου αθλήματος.', true); return; }
				for (const selected of bracketMode === 'cross' ? [group, other] : [group]) {
					if (config_group_teams(selected).length < count) { say(`Ο όμιλος ${selected.id} χρειάζεται τουλάχιστον ${count} ομάδες για αυτήν την τελική φάση.`, true); return; }
				}
				mutate(() => {
					let semis = [];
					while (sources.length > 1) {
						const next = [], round = sources.length;
						for (let i = 0; i < sources.length; i += 2) {
							const id = uniqueCode(round === 8 ? 'qf' : round === 4 ? 'sf' : 'f');
							draft.knockouts.push({id, sport: group.sport, home: sources[i], away: sources[i + 1]}); next.push(id + ':W'); if (round === 4) semis.push(id);
						}
						sources = next;
					}
					if (bracketBronze && semis.length === 2) draft.knockouts.push({id: uniqueCode('bronze'), sport: group.sport, home: semis[0] + ':L', away: semis[1] + ':L'});
				}); say('Η τελική φάση προστέθηκε. Μπορείτε να επεξεργαστείτε κάθε αγώνα παρακάτω.');
			}, 'ce-add-inline')); body.append(quick);
		}
		const knockouts = draft.knockouts.map((k, index) => ({k, index})).filter(one => one.k.sport === sport.name);
		if (!knockouts.length) empty(body, `Δεν υπάρχουν ακόμη νοκ άουτ για ${sport.name}.`, 'Προσθέστε τελική φάση, έναν μεμονωμένο αγώνα ή επιλέξτε άλλο άθλημα παραπάνω.');
		knockouts.forEach(({k, index}, position) => {
			const card = el('article', 'ce-card ce-knockout');
			card.append(row(el('span', 'ce-match-number', String(position + 1).padStart(2, '0')), field('Κωδικός αγώνα', k.id, value => { const old = k.id; k.id = value; renameRef(old, value); }), remove(`Αφαίρεση αγώνα ${k.id}`, () => {
				const action = () => removeRefs([k.id]);
				if (draft.knockouts.some(other => [other.home, other.away].some(ref => ref.startsWith(k.id + ':')))) confirmRemove(`Αφαίρεση αγώνα ${k.id};`, 'Θα αφαιρεθούν και οι επόμενοι αγώνες που χρησιμοποιούν τον νικητή ή τον ηττημένο του.', action);
				else mutate(action);
			})));
			const options = [{value: '', label: 'Επιλέξτε ομάδα ή πρόκριση'}, ...config_opponents(draft, k.sport, index)];
			card.append(row(select('Αντίπαλος Α', k.home, options, value => k.home = value), el('span', 'ce-vs', 'vs'), select('Αντίπαλος Β', k.away, options, value => k.away = value)));
			body.append(card);
		});
		body.append(button('+ Προσθήκη αγώνα νοκ άουτ', () => mutate(() => draft.knockouts.push({id: uniqueCode('k'), sport: sport.name, home: '', away: ''})), 'ce-add'));
	}
	function renderRules(body) {
		if (!draft.sports.length) { empty(body, 'Προσθέστε ένα άθλημα για να ορίσετε τα κριτήριά του.', 'Κάθε άθλημα έχει ανεξάρτητη σειρά ισοβαθμιών.'); return; }
		ruleSport = Math.min(ruleSport, draft.sports.length - 1);
		body.append(sportTabs(ruleSport, value => ruleSport = value, 'Άθλημα ισοβαθμιών'));
		const sport = draft.sports[ruleSport];
		body.append(note('Τα «υπέρ / κατά» μετρούν γκολ στο ποδόσφαιρο, πόντους στο μπάσκετ, runs στο μπέιζμπολ και σετ στο βόλεϊ. Τα μεταξύ τους κριτήρια εφαρμόζονται όταν έχουν ολοκληρωθεί όλοι οι προγραμματισμένοι μεταξύ τους αγώνες και κάθε ζευγάρι έχει παίξει τον ίδιο θετικό αριθμό αγώνων.'));
		const list = el('ol', 'ce-rules'); list.setAttribute('aria-label', `Σειρά κριτηρίων για ${sport.name}`);
		const move = (from, to) => {
			if (from === to || from < 0 || to < 0 || from >= sport.rules.length - 1 || to >= sport.rules.length - 1) return;
			mutate(() => { const [rule] = sport.rules.splice(from, 1); sport.rules.splice(to, 0, rule); sport.customRules = true; });
			say(`Το κριτήριο «${TIEBREAK_CRITERIA[sport.rules[to]]}» μετακινήθηκε στη θέση ${to + 1}.`);
			root.querySelectorAll('.ce-rule')[to]?.querySelector('button')?.focus();
		};
		sport.rules.forEach((rule, i) => {
			const item = el('li', 'ce-rule'); const fixed = rule === 'id'; item.draggable = !fixed; item.dataset.rule = rule;
			item.append(el('span', 'ce-grip', fixed ? '◆' : '⠿'), el('span', 'ce-rule-rank', String(i + 1).padStart(2, '0')));
			const label = el('div', 'ce-rule-label'); label.append(el('strong', '', TIEBREAK_CRITERIA[rule]), el('small', '', CONFIG_RULE_HELP[rule])); item.append(label);
			if (!fixed) {
				const up = button('↑', () => move(i, i - 1), 'ce-icon-button'); up.disabled = i === 0; up.setAttribute('aria-label', `Μετακίνηση πάνω: ${TIEBREAK_CRITERIA[rule]}`);
				const down = button('↓', () => move(i, i + 1), 'ce-icon-button'); down.disabled = i === sport.rules.length - 2; down.setAttribute('aria-label', `Μετακίνηση κάτω: ${TIEBREAK_CRITERIA[rule]}`);
				item.append(up, down, remove(`Απενεργοποίηση: ${TIEBREAK_CRITERIA[rule]}`, () => mutate(() => { sport.rules.splice(i, 1); sport.customRules = true; })));
				item.addEventListener('dragstart', event => { dragRule = {sport: ruleSport, index: i}; event.dataTransfer.setData('text/plain', rule); event.dataTransfer.effectAllowed = 'move'; item.classList.add('is-dragging'); });
				item.addEventListener('dragend', () => { dragRule = null; root.querySelectorAll('.is-drop-target,.is-dragging').forEach(n => n.classList.remove('is-drop-target', 'is-dragging')); });
				item.addEventListener('dragover', event => { if (dragRule?.sport === ruleSport) { event.preventDefault(); item.classList.add('is-drop-target'); } });
				item.addEventListener('dragleave', () => item.classList.remove('is-drop-target'));
				item.addEventListener('drop', event => { event.preventDefault(); if (dragRule?.sport === ruleSport) move(dragRule.index, i); dragRule = null; });
			}
			list.append(item);
		}); body.append(list);
		const inactive = DEFAULT_TIEBREAK_ORDER.filter(rule => !sport.rules.includes(rule));
		if (inactive.length) {
			const disabled = el('div', 'ce-inactive-rules'); disabled.append(el('h4', '', 'Ανενεργά κριτήρια'));
			inactive.forEach(rule => disabled.append(button('+ ' + TIEBREAK_CRITERIA[rule], () => mutate(() => { sport.rules.splice(-1, 0, rule); sport.customRules = true; }), 'ce-add-inline'))); body.append(disabled);
		}
		body.append(button('Επαναφορά προεπιλεγμένης σειράς', () => mutate(() => { sport.rules = [...DEFAULT_TIEBREAK_ORDER]; sport.customRules = false; }), 'button-quiet'));
	}

	function setMode(next) {
		mode = next;
		root.hidden = next !== 'guided'; document.getElementById('config-text').hidden = next !== 'text';
		document.getElementById('config-mode-guided').setAttribute('aria-pressed', String(next === 'guided'));
		document.getElementById('config-mode-text').setAttribute('aria-pressed', String(next === 'text'));
		ui_store('config-mode', next);
		if (next === 'guided') render();
	}
	function receive() {
		history = []; future = []; bracketOpen = null; showIssues = false; say('');
		if (!input.value.trim()) {
			draft = config_defaults(); input.value = config_write_draft(draft); source = input.value;
		} else {
			try { draft = config_read_draft(input.value); source = input.value; }
			catch (error) { source = null; setMode('text'); say('Η διαμόρφωση άνοιξε ως κείμενο. Για χρήση του οδηγού, διορθώστε πρώτα: ' + error.message, true); return; }
		}
		if (draft.days.length) month = new Date(draft.days[0].date.slice(0, 7) + '-01T12:00:00');
		bulkRounds = []; step = 0; ruleSport = 0;
		setMode(ui_stored('config-mode') === 'text' ? 'text' : 'guided');
	}
	config_editor = {receive};
	document.getElementById('config-mode-guided').addEventListener('click', () => {
		if (mode === 'guided') return;
		if (source !== input.value) {
			try {
				const parsed = config_read_draft(input.value);
				draft = parsed; source = input.value; history = []; future = []; showIssues = false;
				if (!input.value.trim() || input.value === CONFIG_TEMPLATE) { draft = config_defaults(); update(); }
				if (draft.days.length) month = new Date(draft.days[0].date.slice(0, 7) + '-01T12:00:00');
			} catch (error) { say('Το κείμενο διατηρήθηκε. Για να ανοίξει στον οδηγό, διορθώστε πρώτα: ' + error.message, true); input.focus(); return; }
		}
		say(''); setMode('guided');
	});
	document.getElementById('config-mode-text').addEventListener('click', () => { say(''); setMode('text'); input.focus(); });
	// Validate before the existing confirmation can replace a drawn program.
	// Programmatic text assignments (including legacy integrations) stay text-first.
	window.addEventListener('submit', event => {
		if (event.target !== input.form) return;
		if (mode === 'guided' && input.value !== source) setMode('text');
		if (mode === 'guided' && !validate()) {
			event.preventDefault(); event.stopImmediatePropagation();
			ui_collapse(document.querySelector('.panel-config'), document.getElementById('collapse'), false, false);
		}
	}, true);
	// Native validation on hidden sections would prevent the custom summary.
	input.form.noValidate = true;
	document.getElementById('save').addEventListener('click', () => {
		try {
			if (appStorage.getItem('config') === input.value) say('Η διαμόρφωση αποθηκεύτηκε σε αυτόν τον browser.');
			else say('Η αποθήκευση δεν ολοκληρώθηκε. Ελέγξτε τον διαθέσιμο χώρο του browser.', true);
		} catch (error) { say('Ο browser δεν επιτρέπει την αποθήκευση της διαμόρφωσης.', true); }
	});
	root.addEventListener('keydown', event => {
		if (event.key === 'Enter' && event.target.tagName === 'INPUT' && event.target.type !== 'checkbox') event.preventDefault();
	});
	receive();
});
