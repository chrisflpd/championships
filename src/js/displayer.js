const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * a day the configuration passes over is still a day of the tournament, and a
 * calendar that leaves it out reads as though the tournament had none. every
 * date from the first to the last is given a card, the ones that were passed
 * over holding no zone of their own.
 *
 * the dates are read out of an iso day, so they are all midnight utc and a day
 * apart is a day of milliseconds apart exactly.
 *
 * @param {day[]} program
 * @returns {object[]} - the days to draw, a passed over one carrying blank
 */
function calendar_days(program) {
	if (program.length === 0)
		return [];
	const given = {};
	program.forEach(day => {
		given[day.date.getTime()] = day;
	});
	const days = [];
	const last = program[program.length - 1].date.getTime();
	for (let t = program[0].date.getTime(); t <= last; t += DAY_MS) {
		days.push(t in given ? given[t] : {
			date: new Date(t),
			dzones: config.zones.map(zone => ({ zone: zone, rounds: [] })),
			blank: true,
		});
	}
	return days;
}

/**
 * the whole program: the workbook tabs and what is on them. the plan is drawn here,
 * the pages and the points by their own sheets, and all three read the workbook
 * rather than the program, so that a match moved by hand is drawn where it was
 * put and not where the search first placed it.
 *
 * @param {day[]} program
 * @returns {void}
 */
function displayer(program) {
	window.currentProgram = program;
	if (typeof sheets_clear === 'function')
		sheets_clear();

	//everything on the page belongs to the program that was there before, tabs and
	//all, so it goes rather than being picked over
	const home = document.getElementById('program') || document.body;
	if (typeof home.replaceChildren === 'function')
		home.replaceChildren();
	else
		home.textContent = '';

	wb_build(program);
	sheets_shell(home);
	sheets_draw();

	//there is something to hand out now
	const excel_button = document.getElementById('excel');
	if (excel_button !== null)
		excel_button.disabled = false;
}

/**
 * draws the plan: a card per day, a row per round and a column per field, every
 * cell of it able to be dragged somewhere else or opened and changed.
 *
 * @param {Element} sheet - where the plan goes
 * @returns {void}
 */
function plan_draw(sheet) {
	const program = window.currentProgram;

	// collect columns
	const cols = workbook.cols;

	//a sport is told apart from the next one by its colour, which follows the
	//order the sports were given in
	const sport_index = {};
	config.sports.forEach((sport, i) => {
		sport_index[sport.name] = i;
	});

	//the zone of a day is named only when there is more than the one unnamed zone.
	//the label columns down the left of a card are that name and the number of the
	//round, or the number of the round alone.
	const named_zones = config.zones.length !== 1 || config.zones[0].name !== null;
	const label_cols = named_zones ? 2 : 1;

	sheets_offer(sheet);

	// create html
	const home = document.createElement('div');
	home.classList.add('day-list');
	sheet.appendChild(home);

	//over the days, what the colours stand for and how much there is to read
	const bar = document.createElement('div');
	bar.classList.add('program-bar');
	home.appendChild(bar);
	const legend = document.createElement('div');
	legend.classList.add('legend');
	bar.appendChild(legend);
	config.sports.forEach((sport, i) => {
		const item = document.createElement('span');
		item.classList.add('legend-item');
		item.dataset.sportIndex = i;
		legend.appendChild(item);
		const swatch = document.createElement('span');
		swatch.classList.add('legend-swatch');
		item.appendChild(swatch);
		const label = document.createElement('span');
		label.textContent = `${sport.name} (${sport.courts.length})`;
		item.appendChild(label);
	});
	//the marking can be in the way rather than the point, so either lot of it can
	//be turned off from beside the plan it marks. it stands by the legend and not
	//across the bar: a wide calendar is scrolled sideways, and anything at the far
	//end of the bar is scrolled off with it.
	const switches = document.createElement('div');
	switches.classList.add('program-switches');
	bar.appendChild(switches);
	[
		[PLAN_RULES_KEY, plan_shows_rules(), 'κανόνων'],
		[PLAN_CAUTIONS_KEY, plan_shows_cautions(), 'συστάσεων'],
	].forEach(one => {
		const button = document.createElement('button');
		button.type = 'button';
		button.classList.add('button', 'button-quiet', 'program-switch');
		button.dataset.tells = one[0];
		button.classList.toggle('is-off', !one[1]);
		button.setAttribute('aria-pressed', one[1] ? 'false' : 'true');
		button.textContent = `${one[1] ? 'Απενεργοποίηση' : 'Ενεργοποίηση'} ${one[2]}`;
		button.addEventListener('click', () => {
			plan_tell(one[0], !one[1]);
			sheets_draw();
		});
		switches.appendChild(button);
	});

	const placed = wb_placed().length;
	const counts = document.createElement('div');
	counts.classList.add('program-counts');
	counts.textContent = `${program.length} ημέρες · ${placed} αγώνες`;
	bar.appendChild(counts);

	const day_grid = document.createElement('div');
	day_grid.classList.add('day-grid');
	home.appendChild(day_grid);

	//the calendar of the workbook and not of the program: it carries the rounds
	//the configuration left out as well, which are times the camp holds and can
	//still put a match in
	workbook.calendar.forEach(day => {
		const day_div = document.createElement('div');
		day_div.classList.add('day');
		if (day.blank)
			day_div.classList.add('day-blank');
		day_grid.appendChild(day_div);
		const day_h = document.createElement('div');
		day_h.classList.add('day-date');
		day_div.appendChild(day_h);
		const day_weekday = document.createElement('span');
		day_weekday.classList.add('day-weekday');
		day_weekday.textContent = day.date.toLocaleDateString('el', {
			weekday: 'long',
		});
		day_h.appendChild(day_weekday);
		const day_full = document.createElement('span');
		day_full.classList.add('day-full');
		day_full.textContent = day.date.toLocaleDateString('el', {
			day: '2-digit',
			month: 'long',
			year: 'numeric',
		});
		day_h.appendChild(day_full);

		//a table, so that every column takes the width its own name needs and the
		//rows stay in line with one another without a width being named anywhere
		const table = document.createElement('table');
		table.classList.add('day-table');
		day_div.appendChild(table);

		//the fields named once at the top of the day, so that a cell underneath is
		//read by looking up instead of by counting across
		const thead = document.createElement('thead');
		table.appendChild(thead);
		const sport_row = document.createElement('tr');
		thead.appendChild(sport_row);
		const sport_corner = document.createElement('th');
		sport_corner.classList.add('corner');
		sport_corner.colSpan = label_cols;
		sport_corner.scope = 'col';
		sport_corner.textContent = 'Άθλημα';
		sport_row.appendChild(sport_corner);
		config.sports.forEach((sport, i) => {
			if (sport.courts.length === 0)
				return;
			const sport_cell = document.createElement('th');
			sport_cell.classList.add('head-sport');
			sport_cell.dataset.sportIndex = i;
			//the name of a sport stands over every one of its fields
			sport_cell.colSpan = sport.courts.length;
			sport_cell.scope = 'colgroup';
			sport_cell.textContent = sport.name;
			sport_row.appendChild(sport_cell);
		});
		const court_row = document.createElement('tr');
		thead.appendChild(court_row);
		const court_corner = document.createElement('th');
		court_corner.classList.add('corner');
		court_corner.colSpan = label_cols;
		court_corner.scope = 'col';
		court_corner.textContent = 'Γήπεδο';
		court_row.appendChild(court_corner);
		cols.forEach(col => {
			const court_cell = document.createElement('th');
			court_cell.classList.add('cell-head');
			court_cell.dataset.sportIndex = sport_index[col.sport.name];
			court_cell.scope = 'col';
			court_cell.textContent = col.court;
			court_cell.title = `${col.court} · ${col.sport.name}`;
			court_row.appendChild(court_cell);
		});

		//a zone of the day is a body of its own, which is what the line between two
		//of them is drawn from. every zone is drawn with the whole of its band, so
		//that the cards keep their lines across the calendar and a round the
		//configuration left out is there to be used.
		day.dzones.forEach(dzone => {
			const zone_body = document.createElement('tbody');
			zone_body.classList.add('zone');
			table.appendChild(zone_body);
			const rounds = dzone.rounds;
			rounds.forEach((round, r) => {
				const round_row = document.createElement('tr');
				round_row.classList.add('round');
				//a round the configuration did not ask for is drawn more quietly,
				//but it is a round like any other and can be filled by hand
				if (!round.given)
					round_row.classList.add('round-extra');
				zone_body.appendChild(round_row);
				if (named_zones && r === 0) {
					//the name of the zone stands beside every round it holds, and is
					//the handle the whole zone is picked up by
					const zone_h = document.createElement('th');
					zone_h.classList.add('zone-name');
					zone_h.rowSpan = rounds.length;
					zone_h.scope = 'rowgroup';
					zone_h.textContent = dzone.zone.name;
					zone_h.dataset.zone = [day.iso, dzone.zone.rank].join('|');
					zone_h.draggable = true;
					zone_h.title = `${dzone.zone.name} · σύρετε τη ζώνη ολόκληρη σε άλλη ζώνη`;
					round_row.appendChild(zone_h);
				}
				const round_h = document.createElement('th');
				round_h.classList.add('round-rank');
				round_h.scope = 'row';
				round_h.textContent = `Γ${r + 1}`;
				//and the number of the round is the handle the whole round is picked
				//up by
				round_h.dataset.round = [day.iso, dzone.zone.rank, round.rank].join('|');
				round_h.draggable = true;
				round_h.title = (round.given
					? `${r + 1}ος γύρος`
					: `${r + 1}ος γύρος · η διαμόρφωση δεν τον ζήτησε, αλλά μπορείτε να βάλετε αγώνα σε αυτόν`)
					+ '\nΣύρετε τον γύρο ολόκληρο σε άλλον γύρο';
				round_row.appendChild(round_h);
				cols.forEach((col, ci) => {
					const col_td = document.createElement('td');
					col_td.classList.add('cell');
					round_row.appendChild(col_td);
					const key = wb_key(day.iso, dzone.zone.rank, round.rank, col.court);
					const game = wb_at(key);
					const shows = game === null || wb_shows(game, col, ci);
					//a field two sports share is one field, so a match on it is drawn
					//and changed under its own sport only. the other column stands for
					//the same field taken, and is not a second place to put anything.
					if (shows) {
						col_td.dataset.key = key;
						//a slot is opened by the keyboard as well as by the pointer
						col_td.tabIndex = 0;
					}
					if (game !== null && shows) {
						col_td.classList.add('cell-match');
						//the colour is the sport's own, which is how a match on a
						//field of another sport is seen to be on one
						col_td.dataset.sportIndex = sport_index[game.sport.name];
						col_td.title = plan_title(game, col.court);
						col_td.draggable = true;
						col_td.textContent = wb_plan_label(game);
						//what does not hold is said on the cell rather than refused. it
						//is kept off the title and given a panel of its own, since a
						//rule that has been broken is worth reading rather than
						//squinting at in the tooltip of the browser.
						plan_mark(col_td,
							plan_shows_rules() ? wb_complaints(key) : [],
							plan_shows_cautions() ? wb_cautions(key) : []);
					} else {
						col_td.classList.add('cell-empty');
						col_td.textContent = '·';
						if (game === null) {
							col_td.title = `${col.court} · ${col.sport.name}`;
						} else {
							col_td.classList.add('cell-taken');
							col_td.title = `${col.court} · πιασμένο από ${game.sport.name}`;
						}
					}
				});
			});
		});
	});

	plan_wire(home);
}

//A score can fill the sides of later knockout matches without redrawing the
//whole editable plan and stealing focus from the score box being typed in.
function plan_refresh_knockouts() {
	document.querySelectorAll('#sheet-plan td.cell-match[data-key]').forEach(cell => {
		const game = wb_at(cell.dataset.key);
		if (game === null || game.kn === null)
			return;
		cell.textContent = wb_plan_label(game);
		const parts = cell.dataset.key.split('|');
		cell.title = plan_title(game, parts[3] || '');
	});
}

/*
 * the two switches
 *
 * a plan being put right by hand is marked up as it goes, and there are times
 * when the marking is in the way rather than the point — a plan that is known to
 * break a rule and is being built around it. either lot can be turned off, and
 * the page remembers which.
 */

const PLAN_RULES_KEY = 'plan-rules';
const PLAN_CAUTIONS_KEY = 'plan-cautions';

function plan_told_off(key) {
	try {
		return localStorage.getItem(key) === 'off';
	} catch (error) {
		return false;
	}
}

function plan_tell(key, on) {
	try {
		localStorage.setItem(key, on ? 'on' : 'off');
	} catch (error) {
		console.log(error);
	}
}

function plan_shows_rules() {
	return !plan_told_off(PLAN_RULES_KEY);
}

function plan_shows_cautions() {
	return !plan_told_off(PLAN_CAUTIONS_KEY);
}

/*
 * what does not hold
 *
 * nothing is refused, so what is wrong has to be read rather than guessed at.
 * the cell is marked, and the rules it breaks are written out in a panel of
 * their own — the tooltip of the browser is small, slow to come and gone the
 * moment the pointer moves, which is no way to read why a plan will not do.
 */

/**
 * marks a cell with what is wrong with it and with what is worth a second look,
 * and hangs both off it.
 *
 * the two are not the same thing. a slot that breaks one of the first cannot be
 * played at all; one that breaks only the second can be played perfectly well
 * and is simply not what the search would have found. so a cell carries the one
 * colour of the worse of the two, and the panel reads out both.
 *
 * @param {Element} cell
 * @param {string[]} said - what cannot stand
 * @param {string[]} careful - what is worth a second look
 * @returns {void}
 */
function plan_mark(cell, said, careful) {
	const mind = careful || [];
	cell.classList.toggle('cell-wrong', said.length > 0);
	cell.classList.toggle('cell-caution', said.length === 0 && mind.length > 0);
	if (said.length)
		cell.dataset.wrong = said.join('\n');
	else
		delete cell.dataset.wrong;
	if (mind.length)
		cell.dataset.caution = mind.join('\n');
	else
		delete cell.dataset.caution;
	if (said.length === 0 && mind.length === 0) {
		cell.removeAttribute('aria-describedby');
		return;
	}
	//said aloud as well, since the panels are only drawn for the eye
	const aloud = [];
	if (said.length)
		aloud.push(`Παραβίαση κανόνα: ${said.join('. ')}`);
	if (mind.length)
		aloud.push(`Συνιστάται προσοχή: ${mind.join('. ')}`);
	cell.setAttribute('aria-label', `${cell.textContent}. ${aloud.join('. ')}`);
}

function plan_warning_close() {
	const open = document.querySelector('.plan-warning');
	if (open !== null)
		open.remove();
}

/**
 * the panel itself, beside the cell it belongs to.
 *
 * @param {Element} cell
 * @returns {void}
 */
function plan_warning_read(cell, which) {
	return (cell.dataset[which] || '').split('\n').filter(one => one.length);
}

/**
 * one heading and its bullets.
 *
 * @param {Element} box
 * @param {string} kind - 'wrong' or 'caution'
 * @param {string} title
 * @param {string[]} lines
 * @returns {void}
 */
function plan_warning_part(box, kind, title, lines) {
	if (lines.length === 0)
		return;
	const head = document.createElement('div');
	head.classList.add('plan-warning-head', 'plan-warning-' + kind);
	const sign = document.createElement('span');
	sign.classList.add('plan-warning-sign');
	sign.setAttribute('aria-hidden', 'true');
	sign.textContent = '⚠';
	head.appendChild(sign);
	const said = document.createElement('span');
	said.textContent = title;
	head.appendChild(said);
	box.appendChild(head);

	const list = document.createElement('ul');
	list.classList.add('plan-warning-list', 'plan-warning-' + kind);
	lines.forEach(one => {
		const item = document.createElement('li');
		item.textContent = one;
		list.appendChild(item);
	});
	box.appendChild(list);
}

function plan_warning_open(cell) {
	plan_warning_close();
	const said = plan_warning_read(cell, 'wrong');
	const careful = plan_warning_read(cell, 'caution');
	if (said.length === 0 && careful.length === 0)
		return;

	const box = document.createElement('div');
	//outlined in the colour of the worse of the two, so that what kind of thing it
	//is is known before a word of it is read
	box.classList.add('plan-warning', said.length ? 'plan-warning-is-wrong' : 'plan-warning-is-caution');
	box.setAttribute('role', 'tooltip');

	plan_warning_part(box, 'wrong', 'Παραβίαση κανόνα', said);
	plan_warning_part(box, 'caution', 'Συνιστάται προσοχή', careful);

	const note = document.createElement('p');
	note.classList.add('plan-warning-note');
	note.textContent = said.length
		? 'Ο αγώνας παραμένει εκεί που τον βάλατε — το πρόγραμμα δεν σας εμποδίζει, μόνο σας το επισημαίνει.'
		: 'Ο αγώνας μπορεί να παιχτεί κανονικά. Η αναζήτηση όμως τηρεί αυτούς τους κανόνες, οπότε αξίζει μια δεύτερη ματιά.';
	box.appendChild(note);

	document.body.appendChild(box);
	//beside the cell, and inside the window
	const at = cell.getBoundingClientRect();
	const width = box.offsetWidth || 320;
	const height = box.offsetHeight || 120;
	const room = window.innerHeight || 768;
	const left = Math.max(8, Math.min(at.left, (window.innerWidth || 1024) - width - 8));
	//over the cell rather than under it when there is no room below
	const below = at.bottom + 8 + height < room;
	box.style.left = `${left + (window.scrollX || 0)}px`;
	box.style.top = `${(below ? at.bottom + 8 : at.top - height - 8) + (window.scrollY || 0)}px`;
}

//the panel follows the pointer and the keyboard alike, so that a plan can be put
//right without a mouse
document.addEventListener('mouseover', event => {
	const cell = event.target.closest ? event.target.closest('td.cell-wrong, td.cell-caution') : null;
	if (cell !== null)
		plan_warning_open(cell);
});

document.addEventListener('mouseout', event => {
	const cell = event.target.closest ? event.target.closest('td.cell-wrong, td.cell-caution') : null;
	if (cell === null)
		return;
	//a move inside the cell is not a move out of it
	if (event.relatedTarget && cell.contains(event.relatedTarget))
		return;
	plan_warning_close();
});

document.addEventListener('focusin', event => {
	const cell = event.target.closest ? event.target.closest('td.cell-wrong, td.cell-caution') : null;
	if (cell !== null)
		plan_warning_open(cell);
	else
		plan_warning_close();
});

//nothing keeps its place once the page moves under it. caught on the way down,
//since a scroll does not bubble.
document.addEventListener('scroll', plan_warning_close, true);

/**
 * after a change of the plan, says straight away what the change has broken
 * rather than waiting to be hovered over.
 *
 * @param {string} key - the slot that was changed
 * @returns {void}
 */
function plan_told(key) {
	const cell = document.querySelector(`#sheet-plan td.cell-wrong[data-key="${key}"], #sheet-plan td.cell-caution[data-key="${key}"]`);
	if (cell !== null)
		plan_warning_open(cell);
}

//what is read on hovering a cell of the plan: the two sides as they stand now,
//and where the match is played
function plan_title(game, court) {
	const sides = wb_sides(game);
	const where = `${game.sport.name} · ${court}`;
	if (sides.home_label === '' && sides.away_label === '')
		return where;
	return `${sides.home_label} – ${sides.away_label}\n${where}`;
}


/*
 * changing the plan
 *
 * a match is dragged from the slot it is in onto another one, swapping with
 * whatever is already there, or a slot is opened and what is played in it said
 * outright. neither is refused for breaking a rule: a plan being put right by
 * hand goes through states that do not hold, so what is wrong is marked on the
 * cell and left to the camp.
 */

/*
 * picking up more than a match
 *
 * the number of a round and the name of a zone are handles: taking one and
 * dropping it on another puts the whole of the one where the other was, field by
 * field. what is under the hand is outlined, so that what is about to move is
 * known before it moves.
 */

//the rows a handle stands for
function plan_block(handle) {
	if (handle.dataset.zone !== undefined)
		return [...handle.closest('tbody.zone').querySelectorAll('tr')];
	const row = handle.closest('tr');
	return row === null ? [] : [row];
}

function plan_outline(handle, on) {
	plan_block(handle).forEach((row, i, all) => {
		row.classList.toggle('is-picking', on);
		row.classList.toggle('is-picking-first', on && i === 0);
		row.classList.toggle('is-picking-last', on && i === all.length - 1);
	});
}

function plan_unoutline(home) {
	home.querySelectorAll('.is-picking, .is-picking-first, .is-picking-last').forEach(row => {
		row.classList.remove('is-picking', 'is-picking-first', 'is-picking-last');
	});
}

//what a handle is holding, and what it may be dropped on: a round on a round, a
//zone on a zone
function plan_handle_of(target, kind) {
	return target.closest ? target.closest(`th[data-${kind}]`) : null;
}

function plan_wire(home) {
	let dragging = null;
	//a round or a zone being carried, rather than a single match
	let carrying = null;

	//what is under the hand is outlined, so that a handle says what it would take
	home.addEventListener('mouseover', event => {
		const handle = plan_handle_of(event.target, 'round') || plan_handle_of(event.target, 'zone');
		if (handle === null || carrying !== null)
			return;
		plan_unoutline(home);
		plan_outline(handle, true);
	});

	home.addEventListener('mouseout', event => {
		const handle = plan_handle_of(event.target, 'round') || plan_handle_of(event.target, 'zone');
		if (handle === null || carrying !== null)
			return;
		if (event.relatedTarget && handle.contains(event.relatedTarget))
			return;
		plan_unoutline(home);
	});

	home.addEventListener('dragstart', event => {
		const handle = plan_handle_of(event.target, 'round') || plan_handle_of(event.target, 'zone');
		if (handle !== null) {
			carrying = handle.dataset.zone !== undefined
				? { kind: 'zone', id: handle.dataset.zone }
				: { kind: 'round', id: handle.dataset.round };
			plan_unoutline(home);
			plan_outline(handle, true);
			home.classList.add('is-dragging');
			if (event.dataTransfer) {
				event.dataTransfer.effectAllowed = 'move';
				event.dataTransfer.setData('text/plain', carrying.id);
			}
			return;
		}
		const cell = event.target.closest ? event.target.closest('td.cell-match') : null;
		if (cell === null)
			return;
		dragging = cell.dataset.key;
		plan_warning_close();
		home.classList.add('is-dragging');
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			//firefox hands out no drag at all unless something is carried
			event.dataTransfer.setData('text/plain', dragging);
		}
	});

	home.addEventListener('dragend', () => {
		dragging = null;
		carrying = null;
		home.classList.remove('is-dragging');
		plan_unoutline(home);
		home.querySelectorAll('.cell-drop').forEach(cell => cell.classList.remove('cell-drop'));
	});

	home.addEventListener('dragover', event => {
		if (carrying !== null) {
			const onto = plan_handle_of(event.target, carrying.kind);
			if (onto === null || onto.dataset[carrying.kind] === carrying.id)
				return;
			event.preventDefault();
			if (event.dataTransfer)
				event.dataTransfer.dropEffect = 'move';
			plan_outline(onto, true);
			return;
		}
		const cell = event.target.closest ? event.target.closest('td.cell[data-key]') : null;
		if (cell === null || dragging === null || cell.dataset.key === dragging)
			return;
		event.preventDefault();
		if (event.dataTransfer)
			event.dataTransfer.dropEffect = 'move';
		cell.classList.add('cell-drop');
	});

	home.addEventListener('dragleave', event => {
		const cell = event.target.closest ? event.target.closest('td.cell[data-key]') : null;
		if (cell !== null)
			cell.classList.remove('cell-drop');
	});

	home.addEventListener('drop', event => {
		if (carrying !== null) {
			const onto = plan_handle_of(event.target, carrying.kind);
			const held = carrying;
			carrying = null;
			plan_unoutline(home);
			if (onto === null || onto.dataset[held.kind] === held.id)
				return;
			event.preventDefault();
			wb_swap(held.kind === 'zone'
				? wb_zone_pairs(held.id, onto.dataset.zone)
				: wb_round_pairs(held.id, onto.dataset.round));
			sheets_draw();
			return;
		}
		const cell = event.target.closest ? event.target.closest('td.cell[data-key]') : null;
		if (cell === null)
			return;
		event.preventDefault();
		const from = dragging !== null ? dragging
			: (event.dataTransfer ? event.dataTransfer.getData('text/plain') : '');
		dragging = null;
		if (!from || from === cell.dataset.key)
			return;
		const to = cell.dataset.key;
		wb_move(from, to);
		sheets_draw();
		//a match dropped somewhere it does not belong says so at once
		plan_told(to);
	});

	home.addEventListener('click', event => {
		const cell = event.target.closest ? event.target.closest('td.cell[data-key]') : null;
		if (cell !== null)
			plan_editor(cell);
	});

	//a handle taken by the keyboard is dropped by the keyboard
	home.addEventListener('dragleave', event => {
		if (carrying === null)
			return;
		const onto = plan_handle_of(event.target, carrying.kind);
		if (onto !== null && event.relatedTarget && !onto.contains(event.relatedTarget))
			plan_outline(onto, false);
	});

	home.addEventListener('keydown', event => {
		if (event.key !== 'Enter' && event.key !== ' ')
			return;
		const cell = event.target.closest ? event.target.closest('td.cell[data-key]') : null;
		if (cell === null)
			return;
		event.preventDefault();
		plan_editor(cell);
	});
}

//the groups and the knockouts that could be played on a field: the ones of a
//sport that field belongs to
function plan_choices(court) {
	const choices = [];
	Object.values(config.groups).forEach(group => {
		if (group.sport.courts.includes(court))
			choices.push({ value: 'g:' + group.id, label: `${group.id} · ${group.sport.name}`, group: group });
	});
	Object.values(config.knockouts).forEach(kn => {
		if (kn.sport.courts.includes(court))
			choices.push({ value: 'k:' + kn.id, label: `${kn.id} · ${kn.sport.name}`, kn: kn });
	});
	return choices;
}

function plan_close() {
	plan_warning_close();
	const open = document.querySelector('.plan-editor');
	if (open !== null)
		open.remove();
	const marked = document.querySelector('.cell-editing');
	if (marked !== null)
		marked.classList.remove('cell-editing');
}

/**
 * the slot laid open: what is played in it, and by whom. a knockout names no
 * teams of its own, so the two of them are read off the matches feeding it and
 * cannot be set here.
 *
 * @param {Element} cell
 * @returns {void}
 */
function plan_editor(cell) {
	plan_close();
	cell.classList.add('cell-editing');
	const key = cell.dataset.key;
	const parts = key.split('|');
	const court = parts[3];
	const game = wb_at(key);
	const choices = plan_choices(court);

	const box = document.createElement('div');
	box.classList.add('plan-editor');
	box.setAttribute('role', 'dialog');
	box.setAttribute('aria-label', 'Αλλαγή αγώνα');

	const head = document.createElement('div');
	head.classList.add('plan-editor-head');
	const zone = config.zones.filter(one => String(one.rank) === parts[1])[0];
	const when = new Date(parts[0] + 'T00:00:00Z').toLocaleDateString('el', { day: '2-digit', month: 'short' });
	head.textContent = `${when} · ${zone && zone.name !== null ? zone.name + ' ' : ''}Γ${Number(parts[2]) + 1} · ${court}`;
	box.appendChild(head);

	const field = (label_text, control) => {
		const row = document.createElement('label');
		row.classList.add('plan-editor-row');
		const span = document.createElement('span');
		span.textContent = label_text;
		row.appendChild(span);
		row.appendChild(control);
		box.appendChild(row);
		return control;
	};

	const what = document.createElement('select');
	const blank = document.createElement('option');
	blank.value = '';
	blank.textContent = '— Κενό —';
	what.appendChild(blank);
	choices.forEach(choice => {
		const option = document.createElement('option');
		option.value = choice.value;
		option.textContent = choice.label;
		what.appendChild(option);
	});
	what.value = game === null ? '' : (game.kn !== null ? 'k:' + game.kn : 'g:' + game.id);
	//a group the field does not play host to is still where the match belongs, so
	//it is offered rather than dropped on opening
	if (game !== null && what.value === '') {
		const option = document.createElement('option');
		option.value = game.kn !== null ? 'k:' + game.kn : 'g:' + game.id;
		option.textContent = `${game.id} · ${game.sport.name}`;
		what.appendChild(option);
		what.value = option.value;
	}
	field('Αγώνας', what);

	const team_select = chosen => {
		const select = document.createElement('select');
		config.teams.forEach(team => {
			const option = document.createElement('option');
			option.value = String(team.id);
			option.textContent = `${wb_char(team.id)} · ${team.name}`;
			select.appendChild(option);
		});
		if (chosen !== null)
			select.value = String(chosen);
		return select;
	};
	const home_select = field('Γηπεδούχος', team_select(game === null ? null : game.home));
	const away_select = field('Φιλοξενούμενη', team_select(game === null ? null : game.away));

	const note = document.createElement('p');
	note.classList.add('plan-editor-note');
	box.appendChild(note);

	//a knockout is whoever comes through to it, so its two sides are read and not
	//chosen
	const follow = () => {
		const knockout = what.value.indexOf('k:') === 0;
		home_select.disabled = knockout || what.value === '';
		away_select.disabled = knockout || what.value === '';
		if (!knockout) {
			note.textContent = '';
			return;
		}
		const kn = config.knockouts[what.value.slice(2)];
		note.textContent = kn === undefined ? ''
			: `${wb_side_label(kn.home)} – ${wb_side_label(kn.away)}`;
	};
	what.addEventListener('change', follow);
	follow();

	//what is already wrong with this slot, and what is worth a second look about
	//it, read in the place the change is made
	const tell = (kind, title, lines) => {
		if (lines.length === 0)
			return;
		const wrong = document.createElement('div');
		wrong.classList.add('plan-editor-said', 'plan-editor-' + kind);
		const wrong_head = document.createElement('div');
		wrong_head.classList.add('plan-editor-said-head');
		wrong_head.textContent = '⚠ ' + title;
		wrong.appendChild(wrong_head);
		const wrong_list = document.createElement('ul');
		lines.forEach(one => {
			const item = document.createElement('li');
			item.textContent = one;
			wrong_list.appendChild(item);
		});
		wrong.appendChild(wrong_list);
		box.appendChild(wrong);
	};
	tell('wrong', 'Παραβίαση κανόνα', plan_shows_rules() ? wb_complaints(key) : []);
	tell('caution', 'Συνιστάται προσοχή', plan_shows_cautions() ? wb_cautions(key) : []);

	const bar = document.createElement('div');
	bar.classList.add('plan-editor-bar');
	box.appendChild(bar);
	const button = (text, cls) => {
		const one = document.createElement('button');
		one.type = 'button';
		one.classList.add('button');
		if (cls)
			one.classList.add(cls);
		one.textContent = text;
		bar.appendChild(one);
		return one;
	};
	const cancel = button('Άκυρο', 'button-quiet');
	const ok = button('Εφαρμογή', 'button-primary');

	cancel.addEventListener('click', plan_close);
	ok.addEventListener('click', () => {
		if (what.value === '')
			wb_clear(key);
		else
			wb_put(key, what.value.slice(2), parseInt(home_select.value), parseInt(away_select.value));
		plan_close();
		sheets_draw();
		//what the change has broken, said as soon as it is made
		plan_told(key);
	});

	document.body.appendChild(box);
	//the editor stands beside the cell it belongs to, and inside the window
	const at = cell.getBoundingClientRect();
	const width = box.offsetWidth || 240;
	const left = Math.max(8, Math.min(at.left, (window.innerWidth || 1024) - width - 8));
	box.style.left = `${left + (window.scrollX || 0)}px`;
	box.style.top = `${at.bottom + 6 + (window.scrollY || 0)}px`;
	what.focus();
}

document.addEventListener('keydown', event => {
	if (event.key === 'Escape')
		plan_close();
});

//a click anywhere else puts the editor away
document.addEventListener('click', event => {
	if (document.querySelector('.plan-editor') === null)
		return;
	if (event.target.closest && (event.target.closest('.plan-editor') || event.target.closest('td.cell[data-key]')))
		return;
	plan_close();
});


/*
 * excel export
 *
 * the plan sheet of the template holds 12 days in a grid of 3 block rows by 4
 * block columns. every day block is 4 round rows (2 zones of 2 rounds) by 5
 * field columns, with the date of the day on the block header row and the zone
 * names on the first column of the block.
 */

const PLAN_DAYS = 12;
const PLAN_ROUNDS = 4;
const PLAN_FIELDS = 5;
const PLAN_UNUSED_RGB = 'FFD9D9D9'; // rgb 217,217,217
const PLAN_SHEET = 'xl/worksheets/sheet1.xml';
const TEAMS_SHEET = 'xl/worksheets/sheet2.xml';
const PAGES_SHEET = 'xl/worksheets/sheet5.xml';
const POINTS_SHEET = 'xl/worksheets/sheet6.xml';
//the pages sheet gives every day a block of its own, this far apart, the date on
//the first row of it and the matches on the rows after
const PAGES_STRIDE = 22;
const PAGES_FIRST = 4;
//the three columns the camp fills in: the two scores and the referee
const PAGES_INPUT = { sh: 'I', sa: 'J', ref: 'K' };
const POINTS_LEFTOVER_CELL = 'L1'; //a word left in the template by an older one
const SHARED_STRINGS = 'xl/sharedStrings.xml';
const WORKBOOK = 'xl/workbook.xml';
//the order the sheets are meant to be read in. a sheet the template has and this
//list does not keeps its place after them.
const SHEET_ORDER = ['plan', 'pages', 'points', 'teams', 'fields', 'games'];
const XL_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

/**
 * @param {number} num - 1 based column number
 * @returns {string}
 */
function getColName(num) {
	let name = "";
	while (num > 0) {
		const rem = (num - 1) % 26;
		name = String.fromCharCode(65 + rem) + name;
		num = Math.floor((num - 1) / 26);
	}
	return name;
}

function getCellRef(dayIdx, roundIdx, fieldIdx) {
	const blockRow = Math.floor(dayIdx / 4);
	const dayInBlock = dayIdx % 4;
	return getColName(3 + dayInBlock * 7 + fieldIdx) + (3 + blockRow * 6 + roundIdx);
}

//the row a match takes on the pages sheet: the block of its day, then the fields
//of one round after the fields of the one before
function getPageRow(dayIdx, roundIdx, fieldIdx) {
	return PAGES_FIRST + dayIdx * PAGES_STRIDE + roundIdx * PLAN_FIELDS + fieldIdx;
}

//the date of a day sits on the header row of its block, on the block first column
function getDateCellRef(dayIdx) {
	const blockRow = Math.floor(dayIdx / 4);
	const dayInBlock = dayIdx % 4;
	return getColName(2 + dayInBlock * 7) + (2 + blockRow * 6);
}

//excel counts days since the 30th of december 1899
function getDateSerial(date) {
	const d = new Date(date);
	const utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
	return Math.floor((utc - Date.UTC(1899, 11, 30)) / 86400000);
}

function indexRows(sheetDoc) {
	const rows = {};
	const rowElems = sheetDoc.getElementsByTagName('row');
	for (let i = 0; i < rowElems.length; i++)
		rows[rowElems[i].getAttribute('r')] = rowElems[i];
	return rows;
}

function findCell(rowElem, ref) {
	const cellElems = rowElem.getElementsByTagName('c');
	for (let i = 0; i < cellElems.length; i++) {
		if (cellElems[i].getAttribute('r') === ref)
			return cellElems[i];
	}
	return null;
}

function removeChildrenNamed(elem, names) {
	for (let i = elem.childNodes.length - 1; i >= 0; i--) {
		const child = elem.childNodes[i];
		if (names.indexOf(child.nodeName) !== -1)
			elem.removeChild(child);
	}
}

function getChildNamed(elem, name) {
	for (let i = 0; i < elem.childNodes.length; i++) {
		if (elem.childNodes[i].nodeName === name)
			return elem.childNodes[i];
	}
	return null;
}

function hasContent(cellElem) {
	return getChildNamed(cellElem, 'v') !== null || getChildNamed(cellElem, 'is') !== null;
}

function getCellValue(cellElem, shared) {
	const isElem = getChildNamed(cellElem, 'is');
	if (isElem !== null)
		return isElem.textContent;
	const vElem = getChildNamed(cellElem, 'v');
	if (vElem === null)
		return '';
	if (cellElem.getAttribute('t') === 's') {
		const idx = parseInt(vElem.textContent);
		return shared[idx] === undefined ? '' : shared[idx];
	}
	return vElem.textContent;
}

async function readSharedStrings(zip, parser) {
	const shared = [];
	const file = zip.file(SHARED_STRINGS);
	if (!file)
		return shared;
	const doc = parser.parseFromString(await file.async('string'), 'text/xml');
	const siElems = doc.getElementsByTagName('si');
	for (let i = 0; i < siElems.length; i++) {
		const tElems = siElems[i].getElementsByTagName('t');
		let text = '';
		for (let j = 0; j < tElems.length; j++)
			text += tElems[j].textContent;
		shared.push(text);
	}
	return shared;
}

/**
 * the template names the character of every team on its teams sheet, one row per
 * team, the id on the first column and the character on the third. the plan is
 * written with those characters, since the games sheet looks them up there.
 *
 * @param {JSZip} zip
 * @param {DOMParser} parser
 * @returns {Promise<object>} - team id -> character
 */
async function readTeamChars(zip, parser) {
	const chars = {};
	const file = zip.file(TEAMS_SHEET);
	if (!file)
		return chars;
	const shared = await readSharedStrings(zip, parser);
	const doc = parser.parseFromString(await file.async('string'), 'text/xml');
	const rowElems = doc.getElementsByTagName('row');
	for (let i = 0; i < rowElems.length; i++) {
		const rowNum = rowElems[i].getAttribute('r');
		const idCell = findCell(rowElems[i], 'A' + rowNum);
		const charCell = findCell(rowElems[i], 'C' + rowNum);
		if (idCell === null || charCell === null)
			continue;
		const id = parseInt(getCellValue(idCell, shared));
		const char = getCellValue(charCell, shared);
		if (!Number.isNaN(id) && char !== '')
			chars[id] = char;
	}
	return chars;
}

//a cell keeps its style, only its content is replaced
function setCellText(doc, cellElem, text) {
	removeChildrenNamed(cellElem, ['v', 'is', 'f']);
	cellElem.setAttribute('t', 'inlineStr');
	const isElem = doc.createElementNS(XL_NS, 'is');
	const tElem = doc.createElementNS(XL_NS, 't');
	tElem.appendChild(doc.createTextNode(text));
	isElem.appendChild(tElem);
	cellElem.appendChild(isElem);
}

function setCellNumber(doc, cellElem, num) {
	removeChildrenNamed(cellElem, ['v', 'is', 'f']);
	cellElem.removeAttribute('t');
	const vElem = doc.createElementNS(XL_NS, 'v');
	vElem.appendChild(doc.createTextNode(String(num)));
	cellElem.appendChild(vElem);
}

//the content of a cell goes, its style stays
function clearCell(cellElem) {
	removeChildrenNamed(cellElem, ['v', 'is', 'f']);
	cellElem.removeAttribute('t');
}

//a formula cell keeps its formula, so that the calculation chain of the
//template stays valid, and carries the value the formula evaluates to
function setCellFormula(doc, cellElem, formula, cached, type) {
	removeChildrenNamed(cellElem, ['v', 'is', 'f']);
	if (type === null)
		cellElem.removeAttribute('t');
	else
		cellElem.setAttribute('t', type);
	const fElem = doc.createElementNS(XL_NS, 'f');
	fElem.appendChild(doc.createTextNode(formula));
	cellElem.appendChild(fElem);
	const vElem = doc.createElementNS(XL_NS, 'v');
	vElem.appendChild(doc.createTextNode(cached));
	cellElem.appendChild(vElem);
}

/**
 * adds a fill of the unused round color and hands out cell formats that copy an
 * existing one and only replace its fill, so that borders, fonts and alignment
 * of the template are kept.
 *
 * @param {Document} stylesDoc
 * @returns {function(string): string} - style index -> style index of its filled copy
 */
function unusedStyleFactory(stylesDoc) {
	const fills = stylesDoc.getElementsByTagName('fills')[0];
	const fillElem = stylesDoc.createElementNS(XL_NS, 'fill');
	const patternElem = stylesDoc.createElementNS(XL_NS, 'patternFill');
	patternElem.setAttribute('patternType', 'solid');
	const fgElem = stylesDoc.createElementNS(XL_NS, 'fgColor');
	fgElem.setAttribute('rgb', PLAN_UNUSED_RGB);
	const bgElem = stylesDoc.createElementNS(XL_NS, 'bgColor');
	bgElem.setAttribute('indexed', '64');
	patternElem.appendChild(fgElem);
	patternElem.appendChild(bgElem);
	fillElem.appendChild(patternElem);
	fills.appendChild(fillElem);
	const fillId = fills.getElementsByTagName('fill').length - 1;
	fills.setAttribute('count', String(fillId + 1));

	const cellXfs = stylesDoc.getElementsByTagName('cellXfs')[0];
	const xfElems = cellXfs.getElementsByTagName('xf');
	const originalXfs = [];
	for (let i = 0; i < xfElems.length; i++)
		originalXfs.push(xfElems[i]);
	let xfCount = originalXfs.length;
	const cache = {};

	return function (styleIdx) {
		if (styleIdx in cache)
			return cache[styleIdx];
		const original = originalXfs[parseInt(styleIdx)] || originalXfs[0];
		const copy = original.cloneNode(true);
		copy.setAttribute('fillId', String(fillId));
		copy.setAttribute('applyFill', '1');
		// the unused rounds are merged, so whatever is written in them later on
		// stands in the middle of the block
		copy.setAttribute('applyAlignment', '1');
		let alignElem = getChildNamed(copy, 'alignment');
		if (alignElem === null) {
			alignElem = stylesDoc.createElementNS(XL_NS, 'alignment');
			copy.appendChild(alignElem);
		}
		alignElem.setAttribute('horizontal', 'center');
		alignElem.setAttribute('vertical', 'center');
		cellXfs.appendChild(copy);
		cache[styleIdx] = String(xfCount);
		xfCount++;
		cellXfs.setAttribute('count', String(xfCount));
		return cache[styleIdx];
	};
}

/**
 * the tabs of a workbook stand in the order its sheets are listed in, so the
 * sheets are listed in the order they are meant to be read in.
 *
 * a defined name belonging to a single sheet points at it by its position in
 * that list, so those have to follow the sheets they belong to.
 *
 * @param {JSZip} zip
 * @param {DOMParser} parser
 * @param {XMLSerializer} serializer
 * @returns {Promise<void>}
 */
async function orderSheets(zip, parser, serializer) {
	const file = zip.file(WORKBOOK);
	if (!file)
		return;
	const doc = parser.parseFromString(await file.async('string'), 'text/xml');
	const sheetsElem = doc.getElementsByTagName('sheets')[0];
	if (!sheetsElem)
		return;
	const sheetElems = [];
	const sheetList = sheetsElem.getElementsByTagName('sheet');
	for (let i = 0; i < sheetList.length; i++)
		sheetElems.push(sheetList[i]);

	const before = sheetElems.map(elem => elem.getAttribute('name'));
	const place = name => {
		const wanted = SHEET_ORDER.indexOf(name);
		return wanted === -1 ? SHEET_ORDER.length + before.indexOf(name) : wanted;
	};
	const ordered = sheetElems.slice().sort((a, b) => place(a.getAttribute('name')) - place(b.getAttribute('name')));
	//appending a child that is already there moves it to the end
	ordered.forEach(elem => sheetsElem.appendChild(elem));

	const after = ordered.map(elem => elem.getAttribute('name'));
	const nameElems = doc.getElementsByTagName('definedName');
	for (let i = 0; i < nameElems.length; i++) {
		const local = nameElems[i].getAttribute('localSheetId');
		if (local === null || local === '')
			continue;
		const was = parseInt(local);
		if (Number.isNaN(was) || before[was] === undefined)
			continue;
		nameElems[i].setAttribute('localSheetId', String(after.indexOf(before[was])));
	}
	zip.file(WORKBOOK, serializer.serializeToString(doc));
}

/**
 * the points sheet of the template still carries a word of an older template,
 * which has no place in the program that is handed out. only that one cell is
 * emptied, keeping everything the template gives it.
 *
 * @param {JSZip} zip
 * @param {DOMParser} parser
 * @param {XMLSerializer} serializer
 * @returns {Promise<void>}
 */
async function clearLeftoverNote(zip, parser, serializer) {
	const file = zip.file(POINTS_SHEET);
	if (!file)
		return;
	const doc = parser.parseFromString(await file.async('string'), 'text/xml');
	const rowElem = indexRows(doc)[POINTS_LEFTOVER_CELL.replace(/[A-Z]+/g, '')];
	if (rowElem === undefined)
		return;
	const cellElem = findCell(rowElem, POINTS_LEFTOVER_CELL);
	if (cellElem === null)
		return;
	clearCell(cellElem);
	zip.file(POINTS_SHEET, serializer.serializeToString(doc));
}

/**
 * the workbook is saved on whatever sheet and cell it was left, so it is opened
 * on the plan, at its first cell.
 *
 * @param {JSZip} zip
 * @param {DOMParser} parser
 * @param {XMLSerializer} serializer
 * @returns {Promise<void>}
 */
async function setOpeningView(zip, parser, serializer) {
	const wbDoc = parser.parseFromString(await zip.file(WORKBOOK).async('string'), 'text/xml');
	//the tab to open on is given by its place among the sheets, so it is looked up
	//rather than assumed, the sheets having just been put in order
	let planTab = 0;
	const sheetElems = wbDoc.getElementsByTagName('sheet');
	for (let i = 0; i < sheetElems.length; i++) {
		if (sheetElems[i].getAttribute('name') === SHEET_ORDER[0])
			planTab = i;
	}
	const wbViewElems = wbDoc.getElementsByTagName('workbookView');
	for (let i = 0; i < wbViewElems.length; i++)
		wbViewElems[i].setAttribute('activeTab', String(planTab));
	zip.file(WORKBOOK, serializer.serializeToString(wbDoc));

	const sheetNames = [];
	for (const name in zip.files) {
		if (/^xl\/worksheets\/sheet\d+\.xml$/.test(name))
			sheetNames.push(name);
	}
	for (const name of sheetNames) {
		const doc = parser.parseFromString(await zip.file(name).async('string'), 'text/xml');
		const viewElems = doc.getElementsByTagName('sheetView');
		let changed = false;
		for (let i = 0; i < viewElems.length; i++) {
			const viewElem = viewElems[i];
			if (name !== PLAN_SHEET) {
				// only one sheet may be selected, or excel opens them as a group
				if (viewElem.getAttribute('tabSelected')) {
					viewElem.removeAttribute('tabSelected');
					changed = true;
				}
				continue;
			}
			viewElem.setAttribute('tabSelected', '1');
			viewElem.removeAttribute('topLeftCell');
			const selectionElems = viewElem.getElementsByTagName('selection');
			for (let j = selectionElems.length - 1; j >= 0; j--)
				selectionElems[j].parentNode.removeChild(selectionElems[j]);
			const selectionElem = doc.createElementNS(XL_NS, 'selection');
			selectionElem.setAttribute('activeCell', 'A1');
			selectionElem.setAttribute('sqref', 'A1');
			viewElem.appendChild(selectionElem);
			changed = true;
		}
		if (changed)
			zip.file(name, serializer.serializeToString(doc));
	}
}

/**
 * fills the plan sheet of the template with the dates and the matches of the
 * program and marks the rounds left without a match.
 *
 * @param {JSZip} zip
 * @param {day[]} program
 * @param {DOMParser} parser
 * @param {XMLSerializer} serializer
 * @returns {Promise<string[]>} - warnings
 */
async function fillPlanSheet(zip, program, parser, serializer) {
	const warnings = [];

	// one column per sport and court pair, in the order of the fields sheet
	const cols = [];
	config.sports.forEach(sport => {
		sport.courts.forEach(court => {
			cols.push({
				sport: sport,
				court: court,
			});
		});
	});
	// the rows of a day are shared out equally between the zones, so a zone of a
	// two zone day takes two of the four. planBlockers has already refused
	// anything that does not divide or does not fit.
	const zoneBand = PLAN_ROUNDS / config.zones.length;

	// the plan is a calendar of 12 consecutive days, so a day takes the block of
	// its own date and the days the program leaves out keep their place, empty
	const firstSerial = getDateSerial(program[0].date);
	const dayIndex = day => getDateSerial(day.date) - firstSerial;
	const lastIdx = dayIndex(program[program.length - 1]);

	const teamChars = await readTeamChars(zip, parser);
	const missingChars = [];
	function teamChar(id) {
		if (id in teamChars)
			return teamChars[id];
		if (missingChars.indexOf(id) === -1)
			missingChars.push(id);
		return String(id);
	}

	// the matches as they stand now, per plan cell, along with the rounds that are
	// time the camp has, which are the ones drawn as available rather than greyed
	// out. the workbook is read and not the program, so a match moved by hand — or
	// put in a round the configuration never asked for — is written where it was
	// put, and the calendar of the workbook carries every round of every day, the
	// dates the configuration passes over included.
	const scheduleData = {};
	const givenRounds = {};
	// where every match of the plan ends up on the pages sheet, so that the score
	// entered against it goes on the same row the printed sheet gave it
	const pageOf = {};
	workbook.calendar.forEach(day => {
		const dIdx = dayIndex(day);
		if (dIdx >= PLAN_DAYS)
			return;
		day.dzones.forEach((dzone, dzIdx) => {
			dzone.rounds.forEach(round => {
				// the round stands where the band of its zone puts it, which is what
				// the workbook has already worked out for the page as well
				const roundIdx = dzIdx * zoneBand + round.row;
				if (roundIdx >= PLAN_ROUNDS) {
					// planBlockers should have caught this; never write past the grid
					warnings.push(`το πρότυπο έχει ${PLAN_ROUNDS} γύρους ανά ημέρα`);
					return;
				}
				if (round.given)
					givenRounds[dIdx + ',' + roundIdx] = true;
				cols.forEach((col, fIdx) => {
					if (fIdx >= PLAN_FIELDS)
						return;
					const game = wb_at(wb_key(day.iso, dzone.zone.rank, round.rank, col.court));
					if (game === null || !wb_shows(game, col, fIdx))
						return;
					// a round the configuration left out and the camp has filled in by
					// hand is time that was used after all, so it is not greyed out
					givenRounds[dIdx + ',' + roundIdx] = true;
					scheduleData[getCellRef(dIdx, roundIdx, fIdx)] = game.kn !== null
						? game.kn
						: [teamChar(game.home), teamChar(game.away)].join('-');
					pageOf[getPageRow(dIdx, roundIdx, fIdx)] = wb_result(game);
				});
			});
		});
	});

	const sheetDoc = parser.parseFromString(await zip.file(PLAN_SHEET).async('string'), 'text/xml');
	const stylesDoc = parser.parseFromString(await zip.file('xl/styles.xml').async('string'), 'text/xml');
	const rows = indexRows(sheetDoc);
	const unusedStyle = unusedStyleFactory(stylesDoc);

	function cellOf(ref) {
		const rowElem = rows[ref.replace(/[A-Z]+/g, '')];
		return rowElem ? findCell(rowElem, ref) : null;
	}

	// every date of the template except the first one is a formula counting
	// consecutive days from it, which is exactly the calendar the blocks lay
	// out, so only the first date is written and the formulas are left as they
	// are. the blocks after the last day of the program hold no date at all.
	for (let dIdx = 0; dIdx < PLAN_DAYS; dIdx++) {
		const cellElem = cellOf(getDateCellRef(dIdx));
		if (cellElem === null)
			continue;
		const fElem = getChildNamed(cellElem, 'f');
		if (dIdx === 0)
			setCellNumber(sheetDoc, cellElem, firstSerial);
		else if (dIdx > lastIdx)
			setCellFormula(sheetDoc, cellElem, '""', '', 'str');
		else if (fElem !== null)
			// the formula is kept as it is, only the value it evaluates to is
			// refreshed, since the first date it counts from has changed
			setCellFormula(sheetDoc, cellElem, fElem.textContent, String(firstSerial + dIdx), null);
	}

	// the matches
	for (const ref in scheduleData) {
		const cellElem = cellOf(ref);
		if (cellElem !== null)
			setCellText(sheetDoc, cellElem, scheduleData[ref]);
	}

	// a round the configuration does not give at all is filled with the unused
	// round color. a round that is given but ends up without a match keeps the
	// colors of the template, since it was time made available for matches.
	// only the fill of a cell changes, everything else the template gives it is
	// kept, and a round the template fills in itself, like the arrival of the
	// first day, is left alone.
	const unusedRounds = {};
	for (let dIdx = 0; dIdx < PLAN_DAYS; dIdx++) {
		for (let roundIdx = 0; roundIdx < PLAN_ROUNDS; roundIdx++) {
			if (dIdx + ',' + roundIdx in givenRounds)
				continue;
			const cellElems = [];
			let filled = false;
			for (let fIdx = 0; fIdx < PLAN_FIELDS; fIdx++) {
				const cellElem = cellOf(getCellRef(dIdx, roundIdx, fIdx));
				if (cellElem === null)
					continue;
				cellElems.push(cellElem);
				if (hasContent(cellElem))
					filled = true;
			}
			if (filled)
				continue;
			cellElems.forEach(cellElem => {
				cellElem.setAttribute('s', unusedStyle(cellElem.getAttribute('s') || '0'));
			});
			unusedRounds[dIdx + ',' + roundIdx] = true;
		}
	}

	// the unused rounds of a zone are merged into a single block, so a whole
	// unused zone reads as one. a merge never reaches over to the next zone,
	// even when every round of the day is unused.
	const mergeElem = sheetDoc.getElementsByTagName('mergeCells')[0];
	if (mergeElem) {
		for (let dIdx = 0; dIdx < PLAN_DAYS; dIdx++) {
			for (let zoneIdx = 0; zoneIdx * 2 < PLAN_ROUNDS; zoneIdx++) {
				const rounds = [];
				for (let roundIdx = zoneIdx * 2; roundIdx < zoneIdx * 2 + 2 && roundIdx < PLAN_ROUNDS; roundIdx++) {
					if (unusedRounds[dIdx + ',' + roundIdx])
						rounds.push(roundIdx);
				}
				if (rounds.length === 0)
					continue;
				const mergeCellElem = sheetDoc.createElementNS(XL_NS, 'mergeCell');
				mergeCellElem.setAttribute('ref', getCellRef(dIdx, rounds[0], 0)
					+ ':' + getCellRef(dIdx, rounds[rounds.length - 1], PLAN_FIELDS - 1));
				mergeElem.appendChild(mergeCellElem);
			}
		}
		mergeElem.setAttribute('count', String(mergeElem.getElementsByTagName('mergeCell').length));
	}

	zip.file(PLAN_SHEET, serializer.serializeToString(sheetDoc));
	zip.file('xl/styles.xml', serializer.serializeToString(stylesDoc));
	// a team the teams sheet of the template does not name has no character to be
	// written with, so the games and the points sheets cannot read its matches
	if (missingChars.length)
		warnings.push(`το φύλλο teams του προτύπου δεν ορίζει χαρακτήρα για τις ομάδες ${missingChars.join(', ')}, οπότε τα φύλλα games και points δεν θα μετρήσουν τους αγώνες τους`);
	return { warnings: warnings, pageOf: pageOf };
}

/**
 * writes the scores and the referees onto the pages sheet, on the rows the plan
 * gave every match. only those three columns are touched: everything else on the
 * sheet is a formula reading the plan back, and the workbook works it out again
 * when it is opened.
 *
 * @param {JSZip} zip
 * @param {object} pageOf - row number -> the result entered against that match
 * @param {DOMParser} parser
 * @param {XMLSerializer} serializer
 * @returns {Promise<void>}
 */
async function fillPagesSheet(zip, pageOf, parser, serializer) {
	const file = zip.file(PAGES_SHEET);
	if (!file)
		return;
	let any = false;
	for (const row in pageOf) {
		const result = pageOf[row];
		if (result.sh !== null || result.sa !== null || result.ref !== '')
			any = true;
	}
	if (!any)
		return;

	const doc = parser.parseFromString(await file.async('string'), 'text/xml');
	const rows = indexRows(doc);
	for (const row in pageOf) {
		const rowElem = rows[row];
		if (rowElem === undefined)
			continue;
		const result = pageOf[row];
		const write = (which, value) => {
			const cellElem = findCell(rowElem, PAGES_INPUT[which] + row);
			if (cellElem === null)
				return;
			//a match that has not been played leaves its cell as the template left
			//it, which is empty and ready to be written in
			if (value === null || value === '')
				clearCell(cellElem);
			else if (which === 'ref')
				setCellText(doc, cellElem, value);
			else
				setCellNumber(doc, cellElem, value);
		};
		write('sh', result.sh);
		write('sa', result.sa);
		write('ref', result.ref);
	}
	zip.file(PAGES_SHEET, serializer.serializeToString(doc));
}

/**
 * the games and the points sheets are formulas over the plan, and the values
 * cached beside them are the ones the template was saved with. the plan has just
 * been rewritten, so the workbook is told to work the lot out on opening rather
 * than showing the numbers of the template until something is touched.
 *
 * @param {JSZip} zip
 * @param {DOMParser} parser
 * @param {XMLSerializer} serializer
 * @returns {Promise<void>}
 */
async function setFullCalc(zip, parser, serializer) {
	const file = zip.file(WORKBOOK);
	if (!file)
		return;
	const doc = parser.parseFromString(await file.async('string'), 'text/xml');
	const calcElems = doc.getElementsByTagName('calcPr');
	if (calcElems.length === 0)
		return;
	calcElems[0].setAttribute('fullCalcOnLoad', '1');
	zip.file(WORKBOOK, serializer.serializeToString(doc));
}

/**
 * the plan sheet of the template is a grid of a fixed size: PLAN_DAYS days, each
 * of PLAN_ROUNDS rows shared out equally between the zones, each of PLAN_FIELDS
 * columns. a program needing more than that cannot be written into it, and a
 * workbook quietly missing matches is worse than no workbook at all, so it is
 * refused with the numbers that do not fit.
 *
 * @param {day[]} program
 * @returns {string[]} - what does not fit, empty when everything does
 */
function planBlockers(program) {
	const reasons = [];

	let courts = 0;
	config.sports.forEach(sport => {
		courts += sport.courts.length;
	});
	if (courts > PLAN_FIELDS)
		reasons.push(`το πρότυπο έχει ${PLAN_FIELDS} στήλες γηπέδων, ενώ η διαμόρφωση έχει ${courts}`);

	const zones = config.zones.length;
	if (PLAN_ROUNDS % zones !== 0) {
		reasons.push(`το πρότυπο έχει ${PLAN_ROUNDS} γύρους ανά ημέρα, που δεν μοιράζονται ισόποσα σε ${zones} ζώνες`);
	} else {
		const band = PLAN_ROUNDS / zones;
		let most = 0;
		program.forEach(day => day.dzones.forEach(dzone => {
			most = Math.max(most, dzone.rounds.length);
		}));
		if (most > band)
			reasons.push(`κάθε ζώνη χωράει ${band} ${band === 1 ? 'γύρο' : 'γύρους'} στο πρότυπο, ενώ η διαμόρφωση φτάνει τους ${most}`);
	}

	const span = getDateSerial(program[program.length - 1].date) - getDateSerial(program[0].date) + 1;
	if (span > PLAN_DAYS)
		reasons.push(`το πρότυπο έχει ${PLAN_DAYS} συνεχόμενες ημέρες, ενώ το πρόγραμμα απλώνεται σε ${span}`);

	return reasons;
}

async function exportToExcel() {
	if (!window.currentProgram || window.currentProgram.length === 0) {
		alert("Δεν υπάρχει διαθέσιμο πρόγραμμα για εξαγωγή. Παρακαλώ υποβάλετε τη διαμόρφωση πρώτα.");
		return;
	}

	if (typeof JSZip === 'undefined') {
		alert("Η βιβλιοθήκη JSZip δεν έχει φορτωθεί ακόμα. Παρακαλώ δοκιμάστε ξανά.");
		return;
	}

	//the workbook is what is written out, not the program, so that the plan the
	//camp has been changing is the one that is handed out. it is built here as
	//well as by the displayer, so that the export stands on its own.
	if (workbook.sig !== wb_signature())
		wb_build(window.currentProgram);

	//nothing is written at all unless the whole program fits the template
	const blockers = planBlockers(window.currentProgram);
	if (blockers.length) {
		alert("Το πρόγραμμα δεν χωράει στο πρότυπο, οπότε δεν δημιουργήθηκε αρχείο:\n" + blockers.join("\n"));
		return;
	}

	try {
		const response = await fetch('assets/template.xlsx');
		if (!response.ok)
			throw new Error("Δεν ήταν δυνατή η φόρτωση του αρχείου template.xlsx.");
		const zip = await JSZip.loadAsync(await response.arrayBuffer());

		const parser = new DOMParser();
		const serializer = new XMLSerializer();

		const filled = await fillPlanSheet(zip, window.currentProgram, parser, serializer);
		const warnings = filled.warnings;
		await fillPagesSheet(zip, filled.pageOf, parser, serializer);
		await clearLeftoverNote(zip, parser, serializer);
		await orderSheets(zip, parser, serializer);
		await setOpeningView(zip, parser, serializer);
		await setFullCalc(zip, parser, serializer);

		const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = 'programma_championships.xlsx';
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);

		if (warnings.length)
			alert("Το αρχείο δημιουργήθηκε, αλλά:\n" + warnings.join("\n"));

	} catch (error) {
		console.error("Σφάλμα κατά την εξαγωγή Excel:", error);
		alert("Σφάλμα κατά την εξαγωγή Excel: " + error.message);
	}
}

document.addEventListener('DOMContentLoaded', () => {
	const excelBtn = document.getElementById('excel');
	if (excelBtn) {
		excelBtn.addEventListener('click', exportToExcel);
	}
});
