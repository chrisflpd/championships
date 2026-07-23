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

function getTeamChar(teamId) {
	if (teamId === 10) return "A";
	return String(teamId);
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
		// Pre-initialize all 12 days x 4 rounds x 5 courts to empty string ""
		const scheduleData = {};
		for (let dIdx = 0; dIdx < 12; dIdx++) {
			for (let rIdx = 0; rIdx < 4; rIdx++) {
				for (let cIdx = 0; cIdx < 5; cIdx++) {
					const cellRef = getCellRef(dIdx, rIdx, cIdx);
					scheduleData[cellRef] = "";
				}
			}
		}

		program.forEach((day, dIdx) => {
			if (dIdx >= 12) return; // template supports 12 days
			day.dzones.forEach((dzone, dzIdx) => {
				dzone.rounds.forEach((round, rIdx) => {
					let roundIdx = dzIdx * 2 + rIdx; // 0..3

					// Rule: For the very first day (dIdx === 0) and very first morning zone (dzIdx === 0):
					// If there is 1 round produced by the algorithm, it is the 2nd round of the morning zone (roundIdx = 1).
					// The 1st round of the 1st morning zone (roundIdx = 0) remains empty.
					if (dIdx === 0 && dzIdx === 0 && dzone.rounds.length === 1) {
						roundIdx = 1;
					}

					cols.forEach((col, cIdx) => {
						const cellRef = getCellRef(dIdx, roundIdx, cIdx);
						const slot = col.court in round.slots ? round.slots[col.court] : undefined;
						const match = slot?.match;
						if (match?.sport?.name === col.sport.name) {
							if ('id' in match.team_home && 'id' in match.team_away) {
								scheduleData[cellRef] = [getTeamChar(match.team_home.id), getTeamChar(match.team_away.id)].join('-');
							} else {
								scheduleData[cellRef] = match.id;
							}
						}
					});
				});
			});
		});

		// Parse XML using browser DOMParser
		const parser = new DOMParser();
		const serializer = new XMLSerializer();

		// Update styles.xml fill 23 to RGB FFA6A6A6 (RGB=166,166,166) and remove double-top borders from styles 178, 179, 180
		if (zip.file("xl/styles.xml")) {
			let stylesXmlText = await zip.file("xl/styles.xml").async("string");
			const stylesDoc = parser.parseFromString(stylesXmlText, "text/xml");
			const fills = stylesDoc.getElementsByTagName("fill");
			if (fills.length > 23) {
				const f23 = fills[23];
				const fg = f23.getElementsByTagName("fgColor")[0];
				if (fg) {
					fg.removeAttribute("theme");
					fg.removeAttribute("tint");
					fg.setAttribute("rgb", "FFA6A6A6");
				}
			}

			const cellXfs = stylesDoc.getElementsByTagName("cellXfs")[0];
			if (cellXfs) {
				const xfs = Array.from(cellXfs.getElementsByTagName("xf"));
				if (xfs.length > 180) {
					xfs[178].setAttribute("borderId", "0");
					xfs[179].setAttribute("borderId", "0");
					xfs[180].setAttribute("borderId", "9");
				}
			}

			zip.file("xl/styles.xml", serializer.serializeToString(stylesDoc));
		}

		const xmlDoc = parser.parseFromString(sheet1XmlText, "text/xml");
		const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

		// Identify unused round slots across 12 days
		// rIdx 0: Morning Round 1
		// rIdx 1: Morning Round 2
		// rIdx 2: Afternoon Round 1
		// rIdx 3: Afternoon Round 2
		const unusedRoundsSet = new Set();
		const unusedMergeRefs = [];

		for (let dIdx = 0; dIdx < 12; dIdx++) {
			if (dIdx >= program.length) {
				for (let rIdx = 0; rIdx < 4; rIdx++) {
					unusedRoundsSet.add(`${dIdx},${rIdx}`);
				}
			} else {
				const day = program[dIdx];

				// Morning Zone (dzIdx = 0)
				const mZone = day.dzones ? day.dzones[0] : undefined;
				const mCount = (mZone && mZone.rounds) ? mZone.rounds.length : 0;
				if (mCount === 0) {
					unusedRoundsSet.add(`${dIdx},0`);
					unusedRoundsSet.add(`${dIdx},1`);
				} else if (mCount === 1) {
					if (dIdx === 0) {
						unusedRoundsSet.add(`${dIdx},0`);
					} else {
						unusedRoundsSet.add(`${dIdx},1`);
					}
				}

				// Afternoon Zone (dzIdx = 1)
				const aZone = day.dzones ? day.dzones[1] : undefined;
				const aCount = (aZone && aZone.rounds) ? aZone.rounds.length : 0;
				if (aCount === 0) {
					unusedRoundsSet.add(`${dIdx},2`);
					unusedRoundsSet.add(`${dIdx},3`);
				} else if (aCount === 1) {
					unusedRoundsSet.add(`${dIdx},3`);
				}
			}
		}

		// Apply merge styles (s=178, 179, 180 with clean court borders and RGB 166,166,166 fill)
		unusedRoundsSet.forEach(key => {
			const [dIdxStr, rIdxStr] = key.split(',');
			const dIdx = parseInt(dIdxStr);
			const rIdx = parseInt(rIdxStr);

			const c0Ref = getCellRef(dIdx, rIdx, 0);
			const c4Ref = getCellRef(dIdx, rIdx, 4);
			unusedMergeRefs.push(`${c0Ref}:${c4Ref}`);

			const rowNum = c0Ref.replace(/[A-Z]/g, '');
			let rowElem = xmlDoc.querySelector(`row[r="${rowNum}"]`);
			if (rowElem) {
				for (let cIdx = 0; cIdx < 5; cIdx++) {
					const cRef = getCellRef(dIdx, rIdx, cIdx);
					let cElem = rowElem.querySelector(`c[r="${cRef}"]`);
					if (!cElem) {
						cElem = xmlDoc.createElementNS(ns, "c");
						cElem.setAttribute("r", cRef);
						rowElem.appendChild(cElem);
					}

					cElem.removeAttribute("t");
					const children = Array.from(cElem.childNodes);
					children.forEach(child => {
						if (child.nodeName === 'v' || child.nodeName === 'is') {
							cElem.removeChild(child);
						}
					});

					if (cIdx === 0) cElem.setAttribute("s", "178");
					else if (cIdx === 4) cElem.setAttribute("s", "180");
					else cElem.setAttribute("s", "179");

					delete scheduleData[cRef];
				}
			}
		});

		// Rebuild <mergeCells> in sheet1.xml
		let mergeCellsElem = xmlDoc.querySelector("mergeCells");
		if (!mergeCellsElem) {
			mergeCellsElem = xmlDoc.createElementNS(ns, "mergeCells");
			xmlDoc.documentElement.appendChild(mergeCellsElem);
		}

		const existingHeaderMerges = [];
		const mcList = Array.from(mergeCellsElem.querySelectorAll("mergeCell"));
		mcList.forEach(mc => {
			const ref = mc.getAttribute("ref") || "";
			if (/^[BIPW]|^(AD|AG|AI|AL)/.test(ref)) {
				existingHeaderMerges.push(ref);
			}
			mergeCellsElem.removeChild(mc);
		});

		const allMerges = existingHeaderMerges.concat(unusedMergeRefs);
		mergeCellsElem.setAttribute("count", String(allMerges.length));

		allMerges.forEach(ref => {
			const mc = xmlDoc.createElementNS(ns, "mergeCell");
			mc.setAttribute("ref", ref);
			mergeCellsElem.appendChild(mc);
		});

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
				if (cElem) {
					// Remove existing v or is nodes
					const children = Array.from(cElem.childNodes);
					children.forEach(child => {
						if (child.nodeName === 'v' || child.nodeName === 'is') {
							cElem.removeChild(child);
						}
					});

					if (valStr !== "") {
						cElem.setAttribute("t", "inlineStr");
						const isElem = xmlDoc.createElementNS(ns, "is");
						const tElem = xmlDoc.createElementNS(ns, "t");
						tElem.textContent = valStr;
						isElem.appendChild(tElem);
						cElem.appendChild(isElem);
					} else {
						cElem.removeAttribute("t");
					}
				} else if (valStr !== "") {
					cElem = xmlDoc.createElementNS(ns, "c");
					cElem.setAttribute("r", cRef);
					cElem.setAttribute("s", "178");
					cElem.setAttribute("t", "inlineStr");
					const isElem = xmlDoc.createElementNS(ns, "is");
					const tElem = xmlDoc.createElementNS(ns, "t");
					tElem.textContent = valStr;
					isElem.appendChild(tElem);
					cElem.appendChild(isElem);
					rowElem.appendChild(cElem);
				}
			}
		}

		const updatedXmlText = serializer.serializeToString(xmlDoc);

		zip.file("xl/worksheets/sheet1.xml", updatedXmlText);

		// Safety fix for games sheet (sheet4.xml): wrap H (th) and I (ta) formulas with IFNA
		// so that 3-character knockout match IDs (like bq1, ps1, vs1, ks1) do not produce #N/A errors
		if (zip.file("xl/worksheets/sheet4.xml")) {
			let sheet4XmlText = await zip.file("xl/worksheets/sheet4.xml").async("string");
			const xmlDoc4 = parser.parseFromString(sheet4XmlText, "text/xml");
			const rowElems4 = xmlDoc4.querySelectorAll("row");
			rowElems4.forEach(rowElem => {
				const rNum = rowElem.getAttribute("r");
				if (rNum === "1") return;
				['H', 'I'].forEach(colLet => {
					const cRef = colLet + rNum;
					const cElem = rowElem.querySelector(`c[r="${cRef}"]`);
					if (cElem) {
						const fElem = cElem.querySelector("f");
						if (fElem && fElem.textContent && !fElem.textContent.startsWith("_xlfn.IFNA")) {
							fElem.textContent = `_xlfn.IFNA(${fElem.textContent},"")`;
						}
					}
				});
			});
			const updatedXmlText4 = serializer.serializeToString(xmlDoc4);
			zip.file("xl/worksheets/sheet4.xml", updatedXmlText4);
		}

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
