console.log("DEBUG: displayer.js loaded (updated template version)");

//the side a match is played by is a team of the configuration in a group and a
//place still to be filled in a knockout, so only the first of the two has a name
function side_name(side) {
	if (side === null || typeof side !== 'object')
		return null;
	return typeof side.name === 'string' ? side.name : null;
}

//what is read on hovering a cell: the sport and the field, and the two sides
//whenever they are already known
function match_title(match, court) {
	const home = side_name(match.team_home);
	const away = side_name(match.team_away);
	const where = `${match.sport.name} · ${court}`;
	return home !== null && away !== null ? `${home} – ${away}\n${where}` : where;
}

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
 * a zone that holds no round is given the room of the most rounds that zone
 * holds on any day, so that a day with nothing in it is the same shape as a day
 * with something, and the calendar keeps its lines across the cards.
 *
 * @param {day[]} program
 * @returns {object.<number, number>} - rows to draw, by the rank of the zone
 */
function zone_rows(program) {
	const rows = {};
	config.zones.forEach(zone => {
		rows[zone.rank] = 1;
	});
	program.forEach(day => day.dzones.forEach(dzone => {
		rows[dzone.zone.rank] = Math.max(rows[dzone.zone.rank] || 1, dzone.rounds.length);
	}));
	return rows;
}

function displayer(program) {
	window.currentProgram = program;

	// clear previous day list if re-generating
	if (typeof document !== 'undefined' && typeof document.querySelector === 'function') {
		const existingHome = document.querySelector('.day-list');
		if (existingHome) {
			existingHome.remove();
		}
	}

	// collect columns
	const cols = [];
	config.sports.forEach(sport => {
		sport.courts.forEach(court => {
			cols.push({
				sport: sport,
				court: court,
			});
		});
	});

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

	// create html
	const home = document.createElement('div');
	home.classList.add('day-list');
	//the program sits in its own section of the page, and on a page that has none
	//it goes where it used to go
	(document.getElementById('program') || document.body).appendChild(home);

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
	let placed = 0;
	program.forEach(day => day.dzones.forEach(dzone => dzone.rounds.forEach(round => {
		Object.values(round.slots).forEach(slot => {
			if (slot.match)
				placed++;
		});
	})));
	const counts = document.createElement('div');
	counts.classList.add('program-counts');
	counts.textContent = `${program.length} ημέρες · ${placed} αγώνες`;
	bar.appendChild(counts);

	const day_grid = document.createElement('div');
	day_grid.classList.add('day-grid');
	home.appendChild(day_grid);

	const rows_of = zone_rows(program);
	calendar_days(program).forEach(day => {
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
		//of them is drawn from. a zone holding no round is drawn all the same, with
		//as many empty rows as that zone takes on the fullest of the days.
		day.dzones.forEach(dzone => {
			const zone_body = document.createElement('tbody');
			zone_body.classList.add('zone');
			table.appendChild(zone_body);
			const rounds = dzone.rounds.length
				? dzone.rounds
				: new Array(rows_of[dzone.zone.rank] || 1).fill(null);
			rounds.forEach((round, r) => {
				const round_row = document.createElement('tr');
				round_row.classList.add('round');
				if (round === null)
					round_row.classList.add('round-blank');
				zone_body.appendChild(round_row);
				if (named_zones && r === 0) {
					//the name of the zone stands beside every round it holds
					const zone_h = document.createElement('th');
					zone_h.classList.add('zone-name');
					zone_h.rowSpan = rounds.length;
					zone_h.scope = 'rowgroup';
					zone_h.textContent = dzone.zone.name;
					round_row.appendChild(zone_h);
				}
				const round_h = document.createElement('th');
				round_h.classList.add('round-rank');
				round_h.scope = 'row';
				//a row standing in for a round the day does not hold is not numbered
				round_h.textContent = round === null ? '' : `Γ${r + 1}`;
				if (round !== null)
					round_h.title = `${r + 1}ος γύρος`;
				round_row.appendChild(round_h);
				cols.forEach(col => {
					const col_td = document.createElement('td');
					col_td.classList.add('cell');
					round_row.appendChild(col_td);
					const slot = round !== null && col.court in round.slots ? round.slots[col.court] : undefined;
					const match = slot?.match;
					if (match?.sport?.name === col.sport.name) { // TODO compare objects
						col_td.classList.add('cell-match');
						col_td.dataset.sportIndex = sport_index[col.sport.name];
						col_td.title = match_title(match, col.court);
						if ('id' in match.team_home && 'id' in match.team_away) {
							col_td.textContent = [match.team_home.id, match.team_away.id].join('-');
						} else {
							col_td.textContent = match.id;
						}
					} else {
						col_td.classList.add('cell-empty');
						col_td.textContent = '·';
					}
				});
			});
		});
	});

	//there is something to hand out now
	const excel_button = document.getElementById('excel');
	if (excel_button !== null)
		excel_button.disabled = false;
}


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
const POINTS_SHEET = 'xl/worksheets/sheet6.xml';
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
	function teamChar(team) {
		if (team.id in teamChars)
			return teamChars[team.id];
		if (missingChars.indexOf(team.id) === -1)
			missingChars.push(team.id);
		return String(team.id);
	}

	// the matches of the program, per plan cell, along with the rounds the
	// configuration gives, which are the ones that may hold a match at all
	const scheduleData = {};
	const givenRounds = {};
	program.forEach(day => {
		const dIdx = dayIndex(day);
		if (dIdx >= PLAN_DAYS)
			return;
		day.dzones.forEach((dzone, dzIdx) => {
			dzone.rounds.forEach((round, rIdx) => {
				let roundIdx = dzIdx * zoneBand + rIdx;
				// on the arrival day the single morning round is the last one of
				// the morning, the ones before it taken by the arrival itself
				if (dIdx === 0 && dzIdx === 0 && dzone.rounds.length === 1)
					roundIdx = zoneBand - 1;
				if (roundIdx >= PLAN_ROUNDS) {
					// planBlockers should have caught this; never write past the grid
					warnings.push(`το πρότυπο έχει ${PLAN_ROUNDS} γύρους ανά ημέρα`);
					return;
				}
				givenRounds[dIdx + ',' + roundIdx] = true;
				cols.forEach((col, fIdx) => {
					if (fIdx >= PLAN_FIELDS)
						return;
					const slot = col.court in round.slots ? round.slots[col.court] : undefined;
					const match = slot?.match;
					if (match?.sport?.name !== col.sport.name)
						return;
					scheduleData[getCellRef(dIdx, roundIdx, fIdx)] = ('id' in match.team_home && 'id' in match.team_away)
						? [teamChar(match.team_home), teamChar(match.team_away)].join('-')
						: match.id;
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
	return warnings;
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

	//nothing is written at all unless the whole program fits the template
	const blockers = planBlockers(window.currentProgram);
	if (blockers.length) {
		alert("Το πρόγραμμα δεν χωράει στο πρότυπο, οπότε δεν δημιουργήθηκε αρχείο:\n" + blockers.join("\n"));
		return;
	}

	try {
		const response = await fetch('template.xlsx');
		if (!response.ok)
			throw new Error("Δεν ήταν δυνατή η φόρτωση του αρχείου template.xlsx.");
		const zip = await JSZip.loadAsync(await response.arrayBuffer());

		const parser = new DOMParser();
		const serializer = new XMLSerializer();

		const warnings = await fillPlanSheet(zip, window.currentProgram, parser, serializer);
		await clearLeftoverNote(zip, parser, serializer);
		await orderSheets(zip, parser, serializer);
		await setOpeningView(zip, parser, serializer);

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
