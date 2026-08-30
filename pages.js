/*
 * the pages: the sheet that was printed every morning and handed to whoever was
 * running the round.
 *
 * the template gave every day a block of its own, twenty two rows apart, and
 * printed columns C to K of it: the round, the field, the two teams by number
 * and by name, the two scores and the referee. everything left of C and right of
 * K was working out and never reached the paper. the same block is drawn here,
 * with the three columns the camp fills in being the three that can be typed in.
 */

//the rounds of a zone are named after it, as the template named them Πρωί Α',
//Πρωί Β', Απόγ. Α' and Απόγ. Β'
const PAGES_ORDINAL = ['Α', 'Β', 'Γ', 'Δ', 'Ε', 'Ζ', 'Η', 'Θ'];

function pages_round_name(zone, rank) {
	const ordinal = rank < PAGES_ORDINAL.length ? PAGES_ORDINAL[rank] + "'" : `Γ${rank + 1}`;
	return zone.name === null ? `Γύρος ${rank + 1}` : `${zone.name} ${ordinal}`;
}

function pages_date(date) {
	return date.toLocaleDateString('el', {
		weekday: 'long',
		day: '2-digit',
		month: 'long',
		year: 'numeric',
	});
}

/**
 * @param {Element} sheet
 * @returns {void}
 */
function pages_draw(sheet) {
	sheets_offer(sheet);

	//only the days that hold a round are worth a page; a date the configuration
	//passes over has nothing to hand out
	const days = workbook.calendar.filter(day => day.dzones.some(dzone => dzone.rounds.length));

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

	const pick = document.createElement('input');
	pick.type = 'checkbox';
	pick.classList.add('pages-pick');
	pick.setAttribute('aria-label', `Επιλογή ${pages_date(day.date)} για εκτύπωση`);
	pick.addEventListener('change', retell);
	head.appendChild(pick);

	const when = document.createElement('h3');
	when.classList.add('pages-date');
	when.textContent = pages_date(day.date);
	head.appendChild(when);

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

	const thead = document.createElement('thead');
	table.appendChild(thead);
	const head_row = document.createElement('tr');
	thead.appendChild(head_row);
	['Γύρος', 'Γήπεδο', '', 'Γηπεδούχος', '', 'Φιλοξενούμενη', 'Σκορ', '', 'Διαιτητής'].forEach((text, i) => {
		const cell = document.createElement('th');
		cell.scope = 'col';
		cell.textContent = text;
		//the two number columns stand with the name they belong to, and the two
		//score boxes under the one word
		if (i === 6)
			cell.colSpan = 2;
		if (i === 7)
			return;
		head_row.appendChild(cell);
	});

	const body = document.createElement('tbody');
	table.appendChild(body);

	day.dzones.forEach(dzone => dzone.rounds.forEach(round => {
		workbook.cols.forEach((col, c) => {
			const key = wb_key(day.iso, dzone.zone.rank, round.rank, col.court);
			const game = wb_at(key);
			const mine = game !== null && wb_shows(game, col, c);
			const row = document.createElement('tr');
			if (c === 0)
				row.classList.add('pages-round-first');
			body.appendChild(row);

			if (c === 0) {
				//the name of the round stands beside every field of it, as the
				//template merged it down the block
				const name = document.createElement('th');
				name.classList.add('pages-round');
				name.scope = 'rowgroup';
				name.rowSpan = workbook.cols.length;
				name.textContent = pages_round_name(dzone.zone, round.rank);
				row.appendChild(name);
			}

			const field = document.createElement('td');
			field.classList.add('pages-field');
			field.textContent = col.court;
			row.appendChild(field);

			if (!mine) {
				const empty = document.createElement('td');
				empty.classList.add('pages-none');
				empty.colSpan = 7;
				empty.textContent = '—';
				row.appendChild(empty);
				return;
			}

			row.dataset.key = key;
			const sides = wb_sides(game);
			const result = wb_result(game);
			if (result.sh !== null && result.sa !== null)
				row.classList.add('pages-played');

			[[sides.home, sides.home_label], [sides.away, sides.away_label]].forEach(side => {
				const id = document.createElement('td');
				id.classList.add('pages-id');
				id.textContent = side[0] === null ? '' : String(side[0]);
				row.appendChild(id);
				const name = document.createElement('td');
				name.classList.add('pages-team');
				//a knockout that nobody has come through to yet reads as what it is
				//waiting for rather than as a blank
				if (side[0] === null)
					name.classList.add('pages-open');
				name.textContent = side[1];
				row.appendChild(name);
			});

			const score = (value, which) => {
				const cell = document.createElement('td');
				cell.classList.add('pages-score');
				const box = document.createElement('input');
				box.type = 'number';
				box.min = '0';
				box.step = '1';
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
		});
	}));

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
		points_refresh();
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
	document.querySelectorAll('.is-print, .print-break').forEach(one => {
		one.classList.remove('is-print', 'print-break');
	});
	cards.forEach((card, i) => {
		card.classList.add('is-print');
		//a page holds two, so the second of every pair is the last one on its sheet
		if (i % 2 === 1 && i !== cards.length - 1)
			card.classList.add('print-break');
	});
	document.body.classList.add('is-printing');
	const clean = () => {
		document.body.classList.remove('is-printing');
		document.querySelectorAll('.is-print, .print-break').forEach(one => {
			one.classList.remove('is-print', 'print-break');
		});
		window.removeEventListener('afterprint', clean);
	};
	window.addEventListener('afterprint', clean);
	window.print();
	//a browser that never says it is done printing would leave the page marked
	setTimeout(clean, 1000);
}
