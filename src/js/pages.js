/*
 * the pages: the sheet that was printed every morning and handed to whoever was
 * running the round.
 *
 * the template gave every day a block of its own, twenty two rows apart, and
 * printed columns C to K of it: the round, the field, the two teams by number
 * and by name, the two scores and the referee. everything left of C and right of
 * K was working out and never reached the paper. The same block is drawn here,
 * with one extra column for the teams sitting each round out and with the three
 * columns the camp fills in being the three that can be typed in.
 */

//the rounds of a zone are named after it, as the template named them Πρωί Α',
//Πρωί Β', Απόγ. Α' and Απόγ. Β'
const PAGES_ORDINAL = ['Α', 'Β', 'Γ', 'Δ', 'Ε', 'Ζ', 'Η', 'Θ'];

function pages_round_name(zone, rank) {
	const ordinal = rank < PAGES_ORDINAL.length ? PAGES_ORDINAL[rank] + "'" : `Γ${rank + 1}`;
	return zone.name === null ? `Γύρος ${rank + 1}` : `${zone.name} ${ordinal}`;
}

/**
 * what a row of a day calls its field.
 *
 * the plan names a sport over every one of its fields, so a field two sports
 * share can be named by the field there. here there is no such row: the block
 * is the round, and every line of it is one field of it. so the field is named
 * by its own name, and where two sports share it — the baseball diamond is laid
 * out on the football pitch — the second of them is named by the sport instead,
 * which is what the workbook printed and what whoever is holding the sheet
 * needs to read.
 *
 * @param {object} col - a column of the workbook
 * @param {number} index - where it stands among them
 * @returns {string}
 */
function pages_field_name(col, index) {
	return workbook.cols.findIndex(other => other.court === col.court) === index
		? col.court
		: col.sport.name;
}

function pages_date(date) {
	return date.toLocaleDateString('el', {
		weekday: 'long',
		day: '2-digit',
		month: 'long',
		year: 'numeric',
	});
}

//The printed sheet uses the same Greek day and date as the screen.
function pages_print_date(date) {
	return date.toLocaleDateString('el', {
		weekday: 'long',
		day: '2-digit',
		month: 'long',
		year: 'numeric',
	});
}

//Everybody whose number is not on either side of a match in this round. A set
//also makes a manually duplicated team count only once.
function pages_free_teams(iso, zone_rank, round_rank) {
	const playing = new Set();
	let games = 0;
	wb_round_keys(iso, zone_rank, round_rank).forEach(key => {
		const game = wb_at(key);
		if (game === null)
			return;
		games++;
		const sides = wb_sides(game);
		if (sides.home !== null)
			playing.add(sides.home);
		if (sides.away !== null)
			playing.add(sides.away);
	});
	return games === 0 ? [] : config.teams.filter(team => !playing.has(team.id));
}

//Keep every rotated print line short enough to fit inside the fixed-height
//round. Four one-digit IDs or three two-digit IDs fit without changing a row.
function pages_free_chunks(teams) {
	const chunks = [];
	let line = '';
	teams.forEach(team => {
		const id = String(team.id);
		const next = line === '' ? id : `${line}, ${id}`;
		if (line !== '' && next.length > 10) {
			chunks.push(line);
			line = id;
		} else {
			line = next;
		}
	});
	if (line !== '')
		chunks.push(line);
	return chunks;
}

function pages_free_fill(cell, teams) {
	cell.replaceChildren();
	cell.setAttribute('aria-label', teams.length === 0
		? 'Δεν υπάρχουν ελεύθερες ομάδες'
		: `Ελεύθερες ομάδες: ${teams.map(team => `${team.id} ${team.name}`).join(', ')}`);

	const screen = document.createElement('div');
	screen.classList.add('pages-free-screen');
	teams.forEach(team => {
		const line = document.createElement('div');
		line.classList.add('pages-free-team');
		const id = document.createElement('span');
		id.classList.add('pages-free-id');
		id.textContent = String(team.id);
		line.appendChild(id);
		const name = document.createElement('span');
		name.classList.add('pages-free-name');
		name.textContent = team.name;
		line.appendChild(name);
		screen.appendChild(line);
	});
	cell.appendChild(screen);

	const printed = document.createElement('div');
	printed.classList.add('pages-free-print');
	pages_free_chunks(teams).forEach(chunk => {
		const line = document.createElement('span');
		line.classList.add('pages-free-print-line');
		const text = document.createElement('span');
		text.classList.add('pages-free-print-text');
		text.textContent = chunk;
		line.appendChild(text);
		printed.appendChild(line);
	});
	cell.appendChild(printed);
}

function pages_free_cell(day, dzone, round, end_class) {
	const cell = document.createElement('td');
	cell.classList.add('pages-free', end_class);
	cell.rowSpan = workbook.cols.length;
	cell.dataset.iso = day.iso;
	cell.dataset.zone = String(dzone.zone.rank);
	cell.dataset.round = String(round.rank);
	pages_free_fill(cell, pages_free_teams(day.iso, dzone.zone.rank, round.rank));
	return cell;
}

/**
 * @param {Element} sheet
 * @returns {void}
 */
function pages_draw(sheet) {
	sheets_offer(sheet);

	//only the days there is something to hand out for: the ones the configuration
	//gives a round, and any date it passes over that the camp has since put a
	//match on by hand
	const days = workbook.calendar.filter(day => day.dzones.some(dzone =>
		dzone.rounds.some(round => round.given || wb_round_used(day, dzone, round))));

	const bar = document.createElement('div');
	bar.classList.add('pages-bar');
	sheet.appendChild(bar);
	const said = document.createElement('span');
	said.classList.add('pages-hint');
	bar.appendChild(said);
	const print_picked = document.createElement('button');
	print_picked.type = 'button';
	print_picked.classList.add('button');
	print_picked.textContent = 'Εκτύπωση επιλεγμένων';
	bar.appendChild(print_picked);

	//two days fit one side of an A4, which is how the camp printed them, so the
	//count is what the line over the days keeps saying
	const picked = () => [...sheet.querySelectorAll('.pages-pick:checked')].map(box => box.closest('.pages-day'));
	const retell = () => {
		const n = picked().length;
		print_picked.disabled = n === 0;
		said.textContent = n === 0
			? 'Επιλέξτε ημέρες για εκτύπωση — δύο ημέρες χωράνε σε μία σελίδα A4.'
			: `${n === 1 ? '1 ημέρα' : n + ' ημέρες'} · ${Math.ceil(n / 2)} ${Math.ceil(n / 2) === 1 ? 'σελίδα' : 'σελίδες'} A4`;
	};

	const list = document.createElement('div');
	list.classList.add('pages-list');
	sheet.appendChild(list);

	days.forEach(day => list.appendChild(pages_day(day, retell)));

	print_picked.addEventListener('click', () => pages_print(picked()));
	retell();
}

/**
 * one day: the date over it and a row for every field of every round.
 *
 * @param {object} day - a day of the calendar
 * @param {function} retell - called when the day is picked or let go
 * @returns {Element}
 */
function pages_day(day, retell) {
	const card = document.createElement('section');
	card.classList.add('pages-day');

	const head = document.createElement('div');
	head.classList.add('pages-head');
	card.appendChild(head);

	const when = document.createElement('h3');
	when.classList.add('pages-date');
	head.appendChild(when);

	//the date itself is what picks the day, so that what has to be hit is a line
	//of writing rather than a box the size of a full stop
	const label = document.createElement('label');
	label.classList.add('pages-pick-label');
	when.appendChild(label);

	const pick = document.createElement('input');
	pick.type = 'checkbox';
	pick.classList.add('pages-pick');
	pick.setAttribute('aria-label', `Επιλογή ${pages_date(day.date)} για εκτύπωση`);
	pick.addEventListener('change', retell);
	label.appendChild(pick);

	const screen_date = document.createElement('span');
	screen_date.classList.add('pages-date-screen');
	screen_date.textContent = pages_date(day.date);
	label.appendChild(screen_date);
	const print_date = document.createElement('span');
	print_date.classList.add('pages-date-print');
	print_date.textContent = pages_print_date(day.date);
	label.appendChild(print_date);

	const print_one = document.createElement('button');
	print_one.type = 'button';
	print_one.classList.add('button', 'button-quiet', 'pages-print');
	print_one.textContent = 'Εκτύπωση';
	print_one.title = 'Εκτύπωση αυτής της ημέρας';
	print_one.addEventListener('click', () => pages_print([card]));
	head.appendChild(print_one);

	const table = document.createElement('table');
	table.classList.add('pages-table');
	card.appendChild(table);

	//The original proportions are tightened just enough to add Ελεύθερες without
	//making the day any wider on screen or on A4.
	const colgroup = document.createElement('colgroup');
	const excel_widths = [4.332, 15, 3, 14.332, 3, 14.332, 6.219, 6.219, 18.551, 12];
	const excel_total = excel_widths.reduce((sum, width) => sum + width, 0);
	excel_widths.forEach(width => {
		const col = document.createElement('col');
		col.style.width = `${100 * width / excel_total}%`;
		colgroup.appendChild(col);
	});
	table.appendChild(colgroup);

	const thead = document.createElement('thead');
	table.appendChild(thead);
	const head_row = document.createElement('tr');
	thead.appendChild(head_row);
	[
		['Γύρος', 1], ['Γήπεδο', 1], ['Γηπεδούχος', 2],
		['Φιλοξενούμενη', 2], ['Σκορ', 2], ['Διαιτητής', 1], ['Ελεύθερες', 1],
	].forEach(column => {
		const cell = document.createElement('th');
		cell.scope = 'col';
		cell.textContent = column[0];
		cell.colSpan = column[1];
		head_row.appendChild(cell);
	});

	const body = document.createElement('tbody');
	table.appendChild(body);

	day.dzones.forEach((dzone, dzone_index) => {
		//the whole band of the zone, so that the printed day keeps the four ruled
		//round blocks the workbook always gave it, whether or not the configuration
		//asked for every one of them
		const rounds = dzone.rounds;
		rounds.forEach((round, round_index) => {
		workbook.cols.forEach((col, c) => {
			const last_round = round_index === rounds.length - 1;
			const last_zone = dzone_index === day.dzones.length - 1;
			const end_class = last_round
				? (last_zone ? 'pages-round-day-end' : 'pages-round-zone-end')
				: 'pages-round-end';
			const key = wb_key(day.iso, dzone.zone.rank, round.rank, col.court);
			const game = wb_at(key);
			const mine = game !== null && wb_shows(game, col, c);
			const row = document.createElement('tr');
			//the last row of a round carries the rule that closes it, and says which
			//of the three that rule is
			if (c === workbook.cols.length - 1) {
				row.classList.add('pages-round-last');
				if (round_index === rounds.length - 1) {
					row.classList.add('pages-zone-last');
					if (dzone_index === day.dzones.length - 1)
						row.classList.add('pages-day-last');
				}
			}
			body.appendChild(row);

			if (c === 0) {
				//the name of the round stands beside every field of it, as the
				//template merged it down the block
				const name = document.createElement('th');
				name.classList.add('pages-round');
				//the merged cell carries its own bottom edge, since the rules of the
				//rows beside it stop at their own columns: a single one between two
				//rounds, the double one of the template between two zones, and none
				//at all where the frame of the day closes it
				name.classList.add(end_class);
				name.scope = 'rowgroup';
				name.rowSpan = workbook.cols.length;
				//the name is a thing of its own inside the cell, so that the rules
				//drawn across the cell can pass behind it and be broken by it rather
				//than being struck through the letters
				const said = document.createElement('span');
				said.classList.add('pages-round-said');
				//named by where it stands in the day and not by the rank it is keyed
				//with, so that the morning the camp arrives on still reads Πρωί Β'
				said.textContent = pages_round_name(dzone.zone, round_index);
				name.appendChild(said);
				row.appendChild(name);
			}

			const field = document.createElement('td');
			field.classList.add('pages-field');
			field.textContent = pages_field_name(col, c);
			//the field it is really played on, for a sport that is named here by
			//its own name
			if (field.textContent !== col.court)
				field.title = `${col.sport.name} · ${col.court}`;
			row.appendChild(field);

			if (!mine) {
				['pages-home-id', 'pages-home-team', 'pages-away-id', 'pages-away-team',
					'pages-home-score', 'pages-away-score', 'pages-ref'].forEach(kind => {
					const empty = document.createElement('td');
					empty.classList.add('pages-none', kind);
					if (kind.indexOf('score') !== -1)
						empty.classList.add('pages-score');
					empty.textContent = '';
					row.appendChild(empty);
				});
				if (c === 0)
					row.appendChild(pages_free_cell(day, dzone, round, end_class));
				return;
			}

			row.dataset.key = key;
			const sides = wb_sides(game);
			const result = wb_result(game);
			if (result.sh !== null && result.sa !== null)
				row.classList.add('pages-played');

			[[sides.home, sides.home_label], [sides.away, sides.away_label]].forEach((side, side_index) => {
				const id = document.createElement('td');
				id.classList.add('pages-id', side_index === 0 ? 'pages-home-id' : 'pages-away-id');
				id.textContent = side[0] === null ? '' : String(side[0]);
				row.appendChild(id);
				const name = document.createElement('td');
				name.classList.add('pages-team', side_index === 0 ? 'pages-home-team' : 'pages-away-team');
				//a knockout that nobody has come through to yet reads as what it is
				//waiting for rather than as a blank
				if (side[0] === null)
					name.classList.add('pages-open');
				name.textContent = side[1];
				row.appendChild(name);
			});

			const score = (value, which) => {
				const cell = document.createElement('td');
				cell.classList.add('pages-score', which === 'sh' ? 'pages-home-score' : 'pages-away-score');
				const box = document.createElement('input');
				//a score is a count of goals, so it takes digits and nothing else. a
				//number box would take a sign, a point and an exponent besides, and
				//would put a pair of arrows in a cell that is 6mm wide, so it is a
				//plain box that only lets digits through.
				box.type = 'text';
				box.inputMode = 'numeric';
				box.autocomplete = 'off';
				box.classList.add('pages-input');
				box.dataset.which = which;
				box.value = value === null ? '' : String(value);
				box.setAttribute('aria-label', which === 'sh' ? 'Σκορ γηπεδούχου' : 'Σκορ φιλοξενούμενης');
				cell.appendChild(box);
				row.appendChild(cell);
				return box;
			};
			score(result.sh, 'sh');
			score(result.sa, 'sa');

			const ref_cell = document.createElement('td');
			ref_cell.classList.add('pages-ref');
			const ref = document.createElement('input');
			ref.type = 'text';
			ref.classList.add('pages-input');
			ref.dataset.which = 'ref';
			ref.value = result.ref;
			ref.setAttribute('aria-label', 'Διαιτητής');
			ref_cell.appendChild(ref);
			row.appendChild(ref_cell);

			if (c === 0)
				row.appendChild(pages_free_cell(day, dzone, round, end_class));
		});
		});
	});

	pages_wire(card);
	return card;
}

/**
 * what is typed into a row goes straight into the workbook. the pages are not
 * drawn again for it, or the box being typed in would be taken away mid word;
 * only the points, which is what a score changes.
 *
 * @param {Element} card
 * @returns {void}
 */
function pages_wire(card) {
	card.addEventListener('input', event => {
		const box = event.target;
		if (!box.classList || !box.classList.contains('pages-input'))
			return;
		//whatever finds its way into a score box — typed, pasted or dictated — comes
		//down to its digits
		if (box.dataset.which !== 'ref') {
			const digits = box.value.replace(/\D+/g, '');
			if (digits !== box.value)
				box.value = digits;
		}
		const row = box.closest('tr[data-key]');
		if (row === null)
			return;
		const game = wb_at(row.dataset.key);
		if (game === null)
			return;
		const read = which => {
			const one = row.querySelector(`.pages-input[data-which="${which}"]`);
			if (one === null || one.value === '')
				return null;
			const n = parseInt(one.value, 10);
			return Number.isNaN(n) ? null : n;
		};
		const ref_box = row.querySelector('.pages-input[data-which="ref"]');
		wb_set_result(game, read('sh'), read('sa'), ref_box === null ? '' : ref_box.value);
		row.classList.toggle('pages-played', read('sh') !== null && read('sa') !== null);
		wb_recount();
		pages_refresh_knockouts();
		plan_refresh_knockouts();
		points_refresh();
	});
}

/*
 * moving between the score boxes
 *
 * the scores are entered off a stack of paper, one match after the next, and the
 * hand never leaves the keyboard while that is going on. so the boxes are walked
 * the way a sheet is walked: tab to the one on the right, shift and tab to the
 * one on the left, and return down to the next match. Arrow keys move through
 * all three editable columns, including the referee; up/down keep the column.
 */

//every score box of the pages, in the order they are read in: the two of a match
//one after the other, match after match and day after day
function pages_score_boxes() {
	return [...document.querySelectorAll(
		'#sheet-pages .pages-input[data-which="sh"], #sheet-pages .pages-input[data-which="sa"]')];
}

function pages_beside(box, step) {
	const boxes = pages_score_boxes();
	const at = boxes.indexOf(box);
	return at === -1 ? null : (boxes[at + step] || null);
}

//return drops to the left score of the next match, as it drops a row in a sheet
function pages_below(box) {
	const homes = [...document.querySelectorAll('#sheet-pages .pages-input[data-which="sh"]')];
	const row = box.closest('tr');
	const mine = row === null ? null : row.querySelector('.pages-input[data-which="sh"]');
	const at = homes.indexOf(mine);
	return at === -1 ? null : (homes[at + 1] || null);
}

function pages_arrow(box, key) {
	const rows = [...document.querySelectorAll('#sheet-pages tr[data-key]')];
	const row = box.closest('tr');
	if (key === 'ArrowUp' || key === 'ArrowDown') {
		const next = rows[rows.indexOf(row) + (key === 'ArrowUp' ? -1 : 1)];
		return next ? next.querySelector(`.pages-input[data-which="${box.dataset.which}"]`) : null;
	}
	const boxes = [...row.querySelectorAll('.pages-input')];
	return boxes[boxes.indexOf(box) + (key === 'ArrowLeft' ? -1 : 1)] || null;
}

document.addEventListener('keydown', event => {
	const box = event.target.closest ? event.target.closest('#sheet-pages .pages-input') : null;
	if (box === null || sheets_current() !== 'pages' || event.defaultPrevented || event.isComposing
		|| event.ctrlKey || event.metaKey || event.altKey)
		return;
	let to = null;
	if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
		// Shift+arrows remain available for selecting text in a referee's name.
		if (event.shiftKey) return;
		to = pages_arrow(box, event.key);
		event.preventDefault();
	}
	else if (event.key === 'Tab' && box.dataset.which !== 'ref')
		to = pages_beside(box, event.shiftKey ? -1 : 1);
	else if (event.key === 'Enter')
		to = pages_below(box);
	else
		return;
	//at the end of the last day there is nowhere of ours to go, so the page is
	//left to do whatever it would have done
	if (to === null)
		return;
	event.preventDefault();
	to.focus();
	//what is there is replaced by what is typed next, rather than added to
	to.select();
});

function pages_refresh_knockouts() {
	document.querySelectorAll('#sheet-pages tr[data-key]').forEach(row => {
		const game = wb_at(row.dataset.key);
		if (game === null || game.kn === null)
			return;
		const sides = wb_sides(game);
		[['home', sides.home, sides.home_label], ['away', sides.away, sides.away_label]].forEach(side => {
			const id = row.querySelector(`.pages-${side[0]}-id`);
			const name = row.querySelector(`.pages-${side[0]}-team`);
			if (id !== null)
				id.textContent = side[1] === null ? '' : String(side[1]);
			if (name !== null) {
				name.textContent = side[2];
				name.classList.toggle('pages-open', side[1] === null);
			}
		});
	});
	document.querySelectorAll('#sheet-pages .pages-free').forEach(cell => {
		pages_free_fill(cell, pages_free_teams(cell.dataset.iso,
			Number(cell.dataset.zone), Number(cell.dataset.round)));
	});
}

/**
 * hands the printer the days that were picked and nothing else, two of them to a
 * sheet of A4, which is how they fitted in the workbook.
 *
 * @param {Element[]} cards
 * @returns {void}
 */
function pages_print(cards) {
	if (cards.length === 0)
		return;
	document.querySelectorAll('.is-print, .print-break, .print-pair-first, .print-pair-last').forEach(one => {
		one.classList.remove('is-print', 'print-break', 'print-pair-first', 'print-pair-last');
	});
	cards.forEach((card, i) => {
		card.classList.add('is-print');
		card.classList.toggle('print-pair-first', i % 2 === 0);
		card.classList.toggle('print-pair-last', i % 2 === 1 || i === cards.length - 1);
		//a page holds two, so the second of every pair is the last one on its sheet
		if (i % 2 === 1 && i !== cards.length - 1)
			card.classList.add('print-break');
	});
	document.body.classList.add('is-printing');
	const old_title = document.title;
	document.title = '';
	const clean = () => {
		document.title = old_title;
		document.body.classList.remove('is-printing');
		document.querySelectorAll('.is-print, .print-break, .print-pair-first, .print-pair-last').forEach(one => {
			one.classList.remove('is-print', 'print-break', 'print-pair-first', 'print-pair-last');
		});
		window.removeEventListener('afterprint', clean);
	};
	window.addEventListener('afterprint', clean);
	window.print();
	//a browser that never says it is done printing would leave the page marked
	setTimeout(clean, 1000);
}
