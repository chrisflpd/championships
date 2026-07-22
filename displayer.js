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

function getCellRef(dayIdx, roundIdx, courtIdx) {
	const blockRow = Math.floor(dayIdx / 4);
	const dayInBlock = dayIdx % 4;
	const rowBase = 3 + blockRow * 6;
	const rIdx = rowBase + roundIdx;
	const colBase = 3 + dayInBlock * 7;
	const cIdx = colBase + courtIdx;
	
	let colStr = "";
	let num = cIdx;
	while (num > 0) {
		let rem = (num - 1) % 26;
		colStr = String.fromCharCode(65 + rem) + colStr;
		num = Math.floor((num - 1) / 26);
	}
	return colStr + rIdx;
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

	const program = window.currentProgram;

	try {
		const response = await fetch('template.xlsx');
		if (!response.ok) {
			throw new Error("Δεν ήταν δυνατή η φόρτωση του αρχείου template.xlsx.");
		}
		const arrayBuffer = await response.arrayBuffer();

		const zip = await JSZip.loadAsync(arrayBuffer);
		let sheet1XmlText = await zip.file("xl/worksheets/sheet1.xml").async("string");

		// Calculate start date serial number for B2
		const startDate = program[0].date;
		const d = new Date(startDate);
		const utcDate = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
		const epoch = Date.UTC(1899, 11, 30);
		const startDateSerial = Math.floor((utcDate - epoch) / 86400000);

		// Build columns mapping matching courts
		const cols = [];
		config.sports.forEach(sport => {
			sport.courts.forEach(court => {
				cols.push({ sport: sport, court: court });
			});
		});

		// Build schedule data mapping cellRef -> valStr
		const scheduleData = {};

		program.forEach((day, dIdx) => {
			if (dIdx >= 12) return; // template supports 12 days
			day.dzones.forEach((dzone, dzIdx) => {
				dzone.rounds.forEach((round, rIdx) => {
					const roundIdx = dzIdx * 2 + rIdx; // 0..3
					cols.forEach((col, cIdx) => {
						const cellRef = getCellRef(dIdx, roundIdx, cIdx);
						const slot = col.court in round.slots ? round.slots[col.court] : undefined;
						const match = slot?.match;
						let valStr = "-";
						if (match?.sport?.name === col.sport.name) {
							if ('id' in match.team_home && 'id' in match.team_away) {
								valStr = [match.team_home.id, match.team_away.id].join('-');
							} else {
								valStr = match.id;
							}
						}
						scheduleData[cellRef] = valStr;
					});
				});
			});
		});

		// Parse XML using browser DOMParser
		const parser = new DOMParser();
		const xmlDoc = parser.parseFromString(sheet1XmlText, "text/xml");
		const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

		// Update B2 date cell
		const b2Cell = xmlDoc.querySelector('c[r="B2"]');
		if (b2Cell) {
			let vElem = b2Cell.querySelector('v');
			if (!vElem) {
				vElem = xmlDoc.createElementNS(ns, "v");
				b2Cell.appendChild(vElem);
			}
			vElem.textContent = String(startDateSerial);
		}

		// Update match cells
		for (const [cRef, valStr] of Object.entries(scheduleData)) {
			const rowNum = cRef.replace(/[A-Z]/g, '');
			let rowElem = xmlDoc.querySelector(`row[r="${rowNum}"]`);
			if (rowElem) {
				let cElem = rowElem.querySelector(`c[r="${cRef}"]`);
				if (!cElem) {
					cElem = xmlDoc.createElementNS(ns, "c");
					cElem.setAttribute("r", cRef);
					cElem.setAttribute("s", "178");
					rowElem.appendChild(cElem);
				}
				cElem.setAttribute("t", "inlineStr");

				// Remove existing v or is children
				const children = Array.from(cElem.childNodes);
				children.forEach(child => {
					if (child.nodeName === 'v' || child.nodeName === 'is') {
						cElem.removeChild(child);
					}
				});

				const isElem = xmlDoc.createElementNS(ns, "is");
				const tElem = xmlDoc.createElementNS(ns, "t");
				tElem.textContent = valStr;
				isElem.appendChild(tElem);
				cElem.appendChild(isElem);
			}
		}

		const serializer = new XMLSerializer();
		const updatedXmlText = serializer.serializeToString(xmlDoc);

		zip.file("xl/worksheets/sheet1.xml", updatedXmlText);

		// Generate blob and download as .xlsx
		const blob = await zip.generateAsync({ type: "blob" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = 'programma_championships.xlsx';
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);

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
