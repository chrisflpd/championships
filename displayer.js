console.log("DEBUG: displayer.js loaded (updated template version)");

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

	// create html
	const home = document.createElement('div');
	home.classList.add('day-list');
	document.body.appendChild(home);
	program.forEach(day => {
		const day_div = document.createElement('div');
		day_div.classList.add('day');
		home.appendChild(day_div);
		const day_h = document.createElement('div');
		day_h.classList.add('day-date');
		day_div.appendChild(day_h);
		day_h.innerHTML = day.date.toLocaleDateString('el', {
			weekday: 'long',
			day: '2-digit',
			month: 'long',
			year: 'numeric',
		});
		const zone_ul = document.createElement('div');
		zone_ul.classList.add('zone-list');
		day_div.appendChild(zone_ul);
		day.dzones.forEach(dzone => {
			if (dzone.rounds.length === 0)
				return;
			const zone_li = document.createElement('div');
			zone_li.classList.add('zone');
			zone_ul.appendChild(zone_li);
			if (config.zones.length !== 1 || config.zones[0].name !== null) {
				const zone_h = document.createElement('div');
				zone_h.classList.add('zone-name');
				zone_li.appendChild(zone_h);
				zone_h.innerHTML = dzone.zone.name;
			}
			const round_ul = document.createElement('div');
			round_ul.classList.add('round-list');
			zone_li.appendChild(round_ul);
			dzone.rounds.forEach(round => {
				const round_li = document.createElement('div');
				round_li.classList.add('round');
				round_ul.appendChild(round_li);
				const col_ul = document.createElement('div');
				col_ul.classList.add('cell-list');
				round_li.appendChild(col_ul);
				cols.forEach(col => {
					const col_li = document.createElement('div');
					col_li.classList.add('cell');
					col_ul.appendChild(col_li);
					const slot = col.court in round.slots ? round.slots[col.court] : undefined;
					const match = slot?.match;
					if (match?.sport?.name === col.sport.name) { // TODO compare objects
						if ('id' in match.team_home && 'id' in match.team_away) {
							col_li.innerHTML = [match.team_home.id, match.team_away.id].join('-');
						} else {
							col_li.innerHTML = match.id;
						}
					} else {
						col_li.innerHTML = '-';
					}
				});
			});
		});
	});

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
const XL_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

function getTeamChar(teamId) {
	if (teamId === 10) return "A";
	return String(teamId);
}

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
		cellXfs.appendChild(copy);
		cache[styleIdx] = String(xfCount);
		xfCount++;
		cellXfs.setAttribute('count', String(xfCount));
		return cache[styleIdx];
	};
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
	if (cols.length > PLAN_FIELDS)
		warnings.push(`το πρότυπο έχει ${PLAN_FIELDS} στήλες γηπέδων, ενώ η διαμόρφωση έχει ${cols.length}`);
	if (program.length > PLAN_DAYS)
		warnings.push(`το πρότυπο έχει ${PLAN_DAYS} ημέρες, ενώ το πρόγραμμα έχει ${program.length}`);

	// the matches of the program, per plan cell
	const scheduleData = {};
	program.forEach((day, dIdx) => {
		if (dIdx >= PLAN_DAYS)
			return;
		day.dzones.forEach((dzone, dzIdx) => {
			dzone.rounds.forEach((round, rIdx) => {
				let roundIdx = dzIdx * 2 + rIdx;
				// on the arrival day the single morning round is the second one,
				// the first is taken by the arrival itself
				if (dIdx === 0 && dzIdx === 0 && dzone.rounds.length === 1)
					roundIdx = 1;
				if (roundIdx >= PLAN_ROUNDS) {
					warnings.push(`το πρότυπο έχει ${PLAN_ROUNDS} γύρους ανά ημέρα`);
					return;
				}
				cols.forEach((col, fIdx) => {
					if (fIdx >= PLAN_FIELDS)
						return;
					const slot = col.court in round.slots ? round.slots[col.court] : undefined;
					const match = slot?.match;
					if (match?.sport?.name !== col.sport.name)
						return;
					scheduleData[getCellRef(dIdx, roundIdx, fIdx)] = ('id' in match.team_home && 'id' in match.team_away)
						? [getTeamChar(match.team_home.id), getTeamChar(match.team_away.id)].join('-')
						: match.id;
				});
			});
		});
	});

	const sheetDoc = parser.parseFromString(await zip.file('xl/worksheets/sheet1.xml').async('string'), 'text/xml');
	const stylesDoc = parser.parseFromString(await zip.file('xl/styles.xml').async('string'), 'text/xml');
	const rows = indexRows(sheetDoc);
	const unusedStyle = unusedStyleFactory(stylesDoc);

	function cellOf(ref) {
		const rowElem = rows[ref.replace(/[A-Z]+/g, '')];
		return rowElem ? findCell(rowElem, ref) : null;
	}

	// every date of the template except the first one is a formula counting
	// consecutive days from it, while a program may skip days. only the offset
	// of each formula is corrected, so that the cells keep their formula and
	// the calculation chain of the template stays untouched.
	const firstSerial = getDateSerial(program[0].date);
	for (let dIdx = 0; dIdx < PLAN_DAYS; dIdx++) {
		const cellElem = cellOf(getDateCellRef(dIdx));
		if (cellElem === null)
			continue;
		const hasFormula = getChildNamed(cellElem, 'f') !== null;
		if (dIdx >= program.length) {
			// no such day, the header is left empty
			if (hasFormula)
				setCellFormula(sheetDoc, cellElem, '""', '', 'str');
			else
				clearCell(cellElem);
		} else if (hasFormula) {
			const serial = getDateSerial(program[dIdx].date);
			setCellFormula(sheetDoc, cellElem, getDateCellRef(0) + '+' + (serial - firstSerial), String(serial), null);
		} else {
			setCellNumber(sheetDoc, cellElem, getDateSerial(program[dIdx].date));
		}
	}

	// the matches
	for (const ref in scheduleData) {
		const cellElem = cellOf(ref);
		if (cellElem !== null)
			setCellText(sheetDoc, cellElem, scheduleData[ref]);
	}

	// a round left without any match is filled with the unused round color.
	// only the fill of a cell changes, everything the template gives it is kept,
	// and a round the template already fills in, like the arrival of the first
	// day, is left alone.
	for (let dIdx = 0; dIdx < PLAN_DAYS; dIdx++) {
		for (let roundIdx = 0; roundIdx < PLAN_ROUNDS; roundIdx++) {
			const cellElems = [];
			let used = false;
			for (let fIdx = 0; fIdx < PLAN_FIELDS; fIdx++) {
				const cellElem = cellOf(getCellRef(dIdx, roundIdx, fIdx));
				if (cellElem === null)
					continue;
				cellElems.push(cellElem);
				if (hasContent(cellElem))
					used = true;
			}
			if (used)
				continue;
			cellElems.forEach(cellElem => {
				cellElem.setAttribute('s', unusedStyle(cellElem.getAttribute('s') || '0'));
			});
		}
	}

	zip.file('xl/worksheets/sheet1.xml', serializer.serializeToString(sheetDoc));
	zip.file('xl/styles.xml', serializer.serializeToString(stylesDoc));
	return warnings;
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

	try {
		const response = await fetch('template.xlsx');
		if (!response.ok)
			throw new Error("Δεν ήταν δυνατή η φόρτωση του αρχείου template.xlsx.");
		const zip = await JSZip.loadAsync(await response.arrayBuffer());

		const parser = new DOMParser();
		const serializer = new XMLSerializer();

		const warnings = await fillPlanSheet(zip, window.currentProgram, parser, serializer);

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
