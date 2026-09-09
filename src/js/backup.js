// Backups are editable-workbook data, not the presentation-only Excel export.
const BACKUP_LIMIT = 2000000;

function championship_validate(text, stored, shared) {
	const bad = () => { throw new Error('Το αρχείο ή ο σύνδεσμος δεν περιέχει έγκυρο πρωτάθλημα.'); };
	const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
	if (typeof text !== 'string' || text.length > 100000) bad();
	// Check round counts before the parser allocates them, not afterwards.
	let section = '';
	for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
		const heading = line.match(/^\[(.*)\]$/);
		if (heading) section = heading[1].toLowerCase();
		else if (section === 'days' && line.trim() && !line.startsWith('#')) {
			const counts = line.trim().split(/\s+/).slice(1).map(Number);
			if (counts.some(n => !Number.isSafeInteger(n) || n < 0 || n > 100)) bad();
		}
	}
	const oldConfig = { ...config }, oldWorkbook = { ...workbook }, oldHistory = { ...wb_history };
	try {
		parse_config(text);
		if (!config.sports.length || !config.zones.length || !config.days.length || !config.teams.length) bad();
		// Bound the calendar before expanding it (including dates omitted by the input).
		if (config.days.at(-1).date - config.days[0].date > 366 * DAY_MS ||
			config.days.some(day => !Number.isFinite(day.date.getTime()) || day.dzones.some(zone => zone.rounds.length > 100))) bad();
		if (!stored && !shared) return null;
		wb_build(config.days);
		const slots = share_slots(), allowed = new Set(slots);
		if (shared) {
			if (![1, 2].includes(shared.v) || !Array.isArray(shared.p)) bad();
			let rows = shared.p;
			if (shared.v === 2) {
				if (rows.length % 5) bad();
				const ids = [...Object.keys(config.groups), ...Object.keys(config.knockouts)];
				const decoded = [];
				let index = 0;
				for (let i = 0; i < rows.length; i += 5) {
					if (!rows.slice(i, i + 5).every(n => Number.isSafeInteger(n) && n >= 0)) bad();
					index += rows[i];
					decoded.push([index, ids[rows[i + 1]], rows[i + 2] || null, rows[i + 3] || null, rows[i + 4]]);
				}
				rows = decoded;
			}
			const plan = {};
			rows.forEach(one => {
				if (!Array.isArray(one) || one.length !== 5 || !Number.isInteger(one[0])) bad();
				const key = slots[one[0]], id = one[1];
				const kn = Object.hasOwn(config.knockouts, id);
				const group = Object.hasOwn(config.groups, id) ? config.groups[id] : null;
				if (!key || Object.hasOwn(plan, key) || (!kn && !group)) bad();
				plan[key] = { sport: (kn ? config.knockouts[id] : group).sport.name,
					id, kn: kn ? id : null, home: kn ? null : one[2], away: kn ? null : one[3], occ: one[4] };
			});
			stored = { sig: workbook.sig, plan, results: shared.r };
		}
		if (!object(stored) || !wb_matches_config({ ...stored, configuration: text }) || !object(stored.plan) || !object(stored.results)) bad();
		const teams = new Set(config.teams.map(team => team.id));
		Object.entries(stored.plan).forEach(([key, game]) => {
			if (!allowed.has(key) || !object(game)) bad();
			const kn = Object.hasOwn(config.knockouts, game.id);
			const group = Object.hasOwn(config.groups, game.id) ? config.groups[game.id] : null;
			if ((!kn && !group) || game.sport !== (kn ? config.knockouts[game.id] : group).sport.name ||
				game.kn !== (kn ? game.id : null) || !Number.isSafeInteger(game.occ) || game.occ < 0 ||
				(kn ? game.home !== null || game.away !== null : !teams.has(game.home) || !teams.has(game.away))) bad();
		});
		Object.entries(stored.results).forEach(([key, result]) => {
			if (['__proto__', 'constructor', 'prototype'].includes(key) || !object(result) || typeof result.ref !== 'string' ||
				![result.sh, result.sa].every(n => n === null || (Number.isSafeInteger(n) && n >= 0))) bad();
		});
		return JSON.parse(JSON.stringify({ ...stored, sig: workbook.sig, configuration: text }));
	} finally {
		Object.keys(config).forEach(key => delete config[key]);
		Object.assign(config, oldConfig);
		Object.assign(workbook, oldWorkbook);
		Object.assign(wb_history, oldHistory);
	}
}

function backup_data() {
	const active = ui_program_drawn();
	const stored = active ? wb_snapshot() : wb_stored();
	const configuration = stored?.configuration || document.forms[0]['config'].value;
	const state = championship_validate(configuration, stored);
	return { format: 'championships', version: 1, configuration, workbook: state };
}

function backup_validate(data) {
	if (!data || data.format !== 'championships' || data.version !== 1 ||
		!Object.hasOwn(data, 'workbook') || (data.workbook !== null && typeof data.workbook !== 'object'))
		throw new Error('Επιλέξτε αρχείο αντιγράφου πρωταθλήματος (.json).');
	const state = championship_validate(data.configuration, data.workbook);
	return { ...data, workbook: state };
}

function backup_apply(data) {
	const checked = backup_validate(data);
	// If storage is full/blocked, leave the current page and old values intact.
	const oldConfig = appStorage.getItem('config'), oldWorkbook = appStorage.getItem(WB_STORE);
	try {
		appStorage.setItem('config', checked.configuration);
		if (checked.workbook) appStorage.setItem(WB_STORE, JSON.stringify(checked.workbook));
		else appStorage.removeItem(WB_STORE);
	} catch (error) {
		try {
			for (const [key, value] of [['config', oldConfig], [WB_STORE, oldWorkbook]]) {
				if (value === null) appStorage.removeItem(key); else appStorage.setItem(key, value);
			}
		} catch (ignored) { /* The browser may refuse all storage access. */ }
		throw new Error('Δεν υπάρχει διαθέσιμος χώρος αποθήκευσης. Η εισαγωγή δεν ολοκληρώθηκε.');
	}
	search_stop();
	saved_close();
	share_close();
	parse_config(checked.configuration);
	document.forms[0]['config'].value = checked.configuration;
	if (checked.workbook) {
		displayer(config.days);
		workbook.offered = checked.workbook.plan;
		workbook.results = checked.workbook.results;
		wb_restore();
		sheets_draw();
	} else {
		sheets_clear();
		document.getElementById('program').replaceChildren();
		window.currentProgram = null;
		workbook.sig = '';
		workbook.configuration = '';
		workbook.cols = [];
		workbook.calendar = [];
		workbook.slots = {};
		workbook.results = {};
		workbook.offered = null;
		wb_history_reset();
		document.getElementById('excel').disabled = true;
	}
	// Reloading an imported championship must not reopen an older URL snapshot.
	if (window.location.hash.startsWith(SHARE_MARK))
		window.history.replaceState(null, '', window.location.pathname + window.location.search);
	search_report('Το πρωτάθλημα και η διαμόρφωση εισήχθησαν και αποθηκεύτηκαν.', true, 'ok');
}

document.addEventListener('DOMContentLoaded', () => {
	const input = document.getElementById('backup-file');
	document.getElementById('backup-export').addEventListener('click', () => {
		try {
			const blob = new Blob([JSON.stringify(backup_data(), null, 2)], { type: 'application/json' });
			const url = URL.createObjectURL(blob), link = document.createElement('a');
			link.href = url;
			link.download = 'championship-' + new Date().toISOString().slice(0, 10) + '.json';
			document.body.appendChild(link);
			link.click();
			link.remove();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
		} catch (error) { search_report(error.message, true, 'error'); }
	});
	document.getElementById('backup-import').addEventListener('click', () => input.click());
	input.addEventListener('change', async () => {
		const file = input.files[0];
		input.value = '';
		if (!file) return;
		try {
			if (file.size > BACKUP_LIMIT) throw new Error('Το αρχείο είναι υπερβολικά μεγάλο (μέγιστο 2 MB).');
			const data = backup_validate(JSON.parse(await file.text()));
			const apply = () => {
				try { backup_apply(data); }
				catch (error) { search_report(error.message, true, 'error'); }
			};
			if (ui_program_drawn() || wb_stored() || document.forms[0]['config'].value.trim())
				ui_confirm({ title: 'Αντικατάσταση πρωταθλήματος;',
					body: ['Η εισαγωγή θα αντικαταστήσει το τρέχον και το αποθηκευμένο πρωτάθλημα, τη διαμόρφωση, τα σκορ και τους διαιτητές. Εξαγάγετε πρώτα ένα αντίγραφο αν θέλετε να τα κρατήσετε.'],
					ok: 'Εισαγωγή', cancel: 'Ακύρωση' }, apply);
			else apply();
		} catch (error) { search_report('Η εισαγωγή απέτυχε. ' + error.message, true, 'error'); }
	});
});
