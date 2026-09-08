/*
 * the four tabs.
 *
 * the workbook the camp used had six sheets and read three of them: the plan it
 * made, the pages it handed out every morning and the points it worked out at
 * the end. those three are the tabs here. the other three, which only ever
 * carried the numbers from one of the readable ones to the next, are in
 * workbook.js and have no tab at all.
 */

const SHEET_KEY = 'sheet';
const SHEET_ORDER_KEY = 'sheet-order';
const SHEETS = [
	{ id: 'plan', name: 'Πρόγραμμα', draw: sheet => plan_draw(sheet) },
	{ id: 'pages', name: 'Φύλλα αγώνων', draw: sheet => pages_draw(sheet) },
	{ id: 'points', name: 'Βαθμολογία', draw: sheet => points_draw(sheet) },
	{ id: 'config', name: 'Διαμόρφωση προγράμματος', draw: null },
];

//a browser may keep no storage at all, and the page still has to open
function sheets_stored() {
	try {
		return appStorage.getItem(SHEET_KEY);
	} catch (error) {
		return null;
	}
}

function sheets_remember(id) {
	try {
		appStorage.setItem(SHEET_KEY, id);
	} catch (error) {
		console.log(error);
	}
}

function sheets_order() {
	const standard = SHEETS.map(one => one.id);
	try {
		const stored = JSON.parse(appStorage.getItem(SHEET_ORDER_KEY));
		if (Array.isArray(stored) && stored.length === standard.length
			&& standard.every(id => stored.includes(id)))
			return stored;
	} catch (error) {
		console.log(error);
	}
	return standard;
}

function sheets_remember_order(strip) {
	try {
		appStorage.setItem(SHEET_ORDER_KEY, JSON.stringify(
			[...strip.querySelectorAll('.sheet-tab')].map(tab => tab.dataset.sheet)));
	} catch (error) {
		console.log(error);
	}
}

/**
 * the strip of tabs and their panels, empty for now.
 *
 * @param {Element} home
 * @returns {void}
 */
function sheets_shell(home) {
	sheets_clear();
	const strip = document.createElement('div');
	strip.classList.add('sheet-tabs');
	strip.setAttribute('role', 'tablist');
	home.appendChild(strip);

	sheets_order().map(id => SHEETS.find(one => one.id === id)).forEach(one => {
		const tab = document.createElement('button');
		tab.type = 'button';
		tab.classList.add('sheet-tab');
		tab.dataset.sheet = one.id;
		tab.id = 'tab-' + one.id;
		tab.setAttribute('role', 'tab');
		tab.setAttribute('aria-controls', 'sheet-' + one.id);
		tab.draggable = true;
		tab.title = 'Σύρετε για αλλαγή σειράς';
		tab.textContent = one.name;
		tab.addEventListener('click', () => sheets_show(one.id, true));
		strip.appendChild(tab);

		const panel = one.id === 'config'
			? document.querySelector('.panel-config')
			: document.createElement('div');
		if (panel === null)
			return;
		if (one.id !== 'config')
			panel.classList.add('sheet');
		panel.dataset.sheet = one.id;
		panel.id = 'sheet-' + one.id;
		panel.setAttribute('role', 'tabpanel');
		panel.setAttribute('aria-labelledby', tab.id);
		if (one.id !== 'config')
			home.appendChild(panel);
	});

	let dragging = null;
	strip.addEventListener('dragstart', event => {
		const tab = event.target.closest ? event.target.closest('.sheet-tab') : null;
		if (tab === null)
			return;
		dragging = tab;
		tab.classList.add('is-dragging');
		tab.setAttribute('aria-grabbed', 'true');
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', tab.dataset.sheet);
		}
	});
	strip.addEventListener('dragover', event => {
		const over = event.target.closest ? event.target.closest('.sheet-tab') : null;
		if (dragging === null || over === null || over === dragging)
			return;
		event.preventDefault();
		const rect = over.getBoundingClientRect();
		strip.insertBefore(dragging, event.clientX < rect.left + rect.width / 2 ? over : over.nextSibling);
	});
	strip.addEventListener('drop', event => {
		if (dragging === null)
			return;
		event.preventDefault();
		sheets_remember_order(strip);
	});
	strip.addEventListener('dragend', () => {
		if (dragging !== null) {
			dragging.classList.remove('is-dragging');
			dragging.setAttribute('aria-grabbed', 'false');
		}
		dragging = null;
		sheets_remember_order(strip);
	});

	//the tabs are walked with the arrow keys, as a tablist is
	strip.addEventListener('keydown', event => {
		const step = event.key === 'ArrowRight' ? 1 : (event.key === 'ArrowLeft' ? -1 : 0);
		if (step === 0)
			return;
		event.preventDefault();
		const ids = [...strip.querySelectorAll('.sheet-tab')].map(tab => tab.dataset.sheet);
		const at = ids.indexOf(sheets_current());
		const next = ids[(at + step + ids.length) % ids.length];
		sheets_show(next, true);
		const tab = document.getElementById('tab-' + next);
		if (tab !== null)
			tab.focus();
	});

	//The configuration is the fourth tab, while its existing form remains the
	//same element so none of its wiring is duplicated or lost.
	const config_panel = document.querySelector('.panel-config');
	if (config_panel !== null && config_panel.parentNode !== null) {
		strip.classList.add('sheet-tabs-config');
		config_panel.parentNode.insertBefore(strip, config_panel);
	}
}

function sheets_clear() {
	delete document.body.dataset.sheet;
	document.querySelectorAll('.sheet-tabs').forEach(strip => strip.remove());
	const config_panel = document.querySelector('.panel-config');
	if (config_panel !== null) {
		config_panel.removeAttribute('data-sheet');
		config_panel.removeAttribute('role');
		config_panel.removeAttribute('aria-labelledby');
		config_panel.removeAttribute('id');
		config_panel.hidden = false;
	}
}

function sheets_current() {
	const open = document.querySelector('.sheet-tab.is-open');
	return open === null ? SHEETS[0].id : open.dataset.sheet;
}

/**
 * @param {string} id
 * @param {boolean} remember - whether the choice was the camp's own
 * @returns {void}
 */
function sheets_show(id, remember) {
	document.body.dataset.sheet = id;
	document.querySelectorAll('.sheet-tab').forEach(tab => {
		const open = tab.dataset.sheet === id;
		tab.classList.toggle('is-open', open);
		tab.setAttribute('aria-selected', open ? 'true' : 'false');
		tab.tabIndex = open ? 0 : -1;
	});
	document.querySelectorAll('.sheet, .panel-config[data-sheet="config"]').forEach(panel => {
		panel.hidden = panel.dataset.sheet !== id;
	});
	if (remember)
		sheets_remember(id);
}

/**
 * draws the three workbook tabs over again. a score changes the standings and a match
 * moved changes the pages, so the cheapest thing that is certainly right is to
 * draw the lot, the three of them together being a few hundred rows.
 *
 * @returns {void}
 */
function sheets_draw() {
	//the tab strip itself is not redrawn, so whichever tab is open stays open
	const open = document.querySelector('.sheet-tab.is-open') !== null;
	const showing = sheets_current();
	//the standings are read many times over by the pages and the points, and the
	//results they are read from do not change while they are being drawn
	wb_recount();
	SHEETS.forEach(one => {
		if (one.draw === null)
			return;
		const panel = document.getElementById('sheet-' + one.id);
		if (panel === null)
			return;
		if (typeof panel.replaceChildren === 'function')
			panel.replaceChildren();
		else
			panel.textContent = '';
		one.draw(panel);
	});
	if (open) {
		sheets_show(showing, false);
		return;
	}
	//nothing was open, so this is a program arriving: the tab the camp was last
	//reading is the one to open on
	const wanted = sheets_stored();
	sheets_show(SHEETS.some(one => one.id === wanted) ? wanted : SHEETS[0].id, false);
}

/**
 * the line offering back the plan a previous visit left. it is put on the plan
 * and on the pages, since either of the two may be the first thing looked at.
 *
 * @param {Element} sheet
 * @returns {void}
 */
function sheets_offer(sheet) {
	if (!workbook.offered)
		return;
	const bar = document.createElement('div');
	bar.classList.add('sheet-offer');
	const text = document.createElement('span');
	text.textContent = 'Υπάρχει αποθηκευμένο πρόγραμμα από προηγούμενη επίσκεψη, με τις αλλαγές που είχατε κάνει.';
	bar.appendChild(text);
	const take = document.createElement('button');
	take.type = 'button';
	take.classList.add('button', 'button-primary');
	take.textContent = 'Επαναφορά';
	take.addEventListener('click', () => {
		if (wb_restore())
			sheets_draw();
	});
	bar.appendChild(take);
	const drop = document.createElement('button');
	drop.type = 'button';
	drop.classList.add('button', 'button-quiet');
	drop.textContent = 'Αγνόηση';
	drop.addEventListener('click', () => {
		workbook.offered = null;
		wb_save();
		sheets_draw();
	});
	bar.appendChild(drop);
	sheet.appendChild(bar);
}
