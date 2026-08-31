/*
 * the three tabs.
 *
 * the workbook the camp used had six sheets and read three of them: the plan it
 * made, the pages it handed out every morning and the points it worked out at
 * the end. those three are the tabs here. the other three, which only ever
 * carried the numbers from one of the readable ones to the next, are in
 * workbook.js and have no tab at all.
 */

const SHEET_KEY = 'sheet';
const SHEETS = [
	{ id: 'plan', name: 'Πρόγραμμα', draw: sheet => plan_draw(sheet) },
	{ id: 'pages', name: 'Φύλλα αγώνων', draw: sheet => pages_draw(sheet) },
	{ id: 'points', name: 'Βαθμολογία', draw: sheet => points_draw(sheet) },
];

//a browser may keep no storage at all, and the page still has to open
function sheets_stored() {
	try {
		return localStorage.getItem(SHEET_KEY);
	} catch (error) {
		return null;
	}
}

function sheets_remember(id) {
	try {
		localStorage.setItem(SHEET_KEY, id);
	} catch (error) {
		console.log(error);
	}
}

/**
 * the strip of tabs and the three panels under it, empty for now.
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

	SHEETS.forEach(one => {
		const tab = document.createElement('button');
		tab.type = 'button';
		tab.classList.add('sheet-tab');
		tab.dataset.sheet = one.id;
		tab.id = 'tab-' + one.id;
		tab.setAttribute('role', 'tab');
		tab.setAttribute('aria-controls', 'sheet-' + one.id);
		tab.textContent = one.name;
		tab.addEventListener('click', () => sheets_show(one.id, true));
		strip.appendChild(tab);

		const panel = document.createElement('div');
		panel.classList.add('sheet');
		panel.dataset.sheet = one.id;
		panel.id = 'sheet-' + one.id;
		panel.setAttribute('role', 'tabpanel');
		panel.setAttribute('aria-labelledby', tab.id);
		home.appendChild(panel);
	});

	//the tabs are walked with the arrow keys, as a tablist is
	strip.addEventListener('keydown', event => {
		const step = event.key === 'ArrowRight' ? 1 : (event.key === 'ArrowLeft' ? -1 : 0);
		if (step === 0)
			return;
		event.preventDefault();
		const ids = SHEETS.map(one => one.id);
		const at = ids.indexOf(sheets_current());
		const next = ids[(at + step + ids.length) % ids.length];
		sheets_show(next, true);
		const tab = document.getElementById('tab-' + next);
		if (tab !== null)
			tab.focus();
	});

	//The configuration belongs to the Program tab. It stays in its original
	//place before a program exists, then sits directly below the tab strip.
	const config_panel = document.querySelector('.panel-config');
	if (config_panel !== null && config_panel.parentNode !== null) {
		strip.classList.add('sheet-tabs-config');
		config_panel.parentNode.insertBefore(strip, config_panel);
	}
}

function sheets_clear() {
	document.querySelectorAll('.sheet-tabs').forEach(strip => strip.remove());
	const config_panel = document.querySelector('.panel-config');
	if (config_panel !== null)
		config_panel.hidden = false;
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
	document.querySelectorAll('.sheet-tab').forEach(tab => {
		const open = tab.dataset.sheet === id;
		tab.classList.toggle('is-open', open);
		tab.setAttribute('aria-selected', open ? 'true' : 'false');
		tab.tabIndex = open ? 0 : -1;
	});
	document.querySelectorAll('.sheet').forEach(panel => {
		panel.hidden = panel.dataset.sheet !== id;
	});
	const config_panel = document.querySelector('.panel-config');
	if (config_panel !== null)
		config_panel.hidden = id !== 'plan';
	if (remember)
		sheets_remember(id);
}

/**
 * draws all three tabs over again. a score changes the standings and a match
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
