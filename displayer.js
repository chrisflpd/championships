console.log("DEBUG: displayer.js loaded (updated version)");

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

function getDayRowsForExcel(day) {
	const cols = [];
	config.sports.forEach(sport => {
		sport.courts.forEach(court => {
			cols.push({ sport: sport, court: court });
		});
	});

	const rows = [];
	
	let dzonesToRender = day.dzones;
	if (!dzonesToRender || dzonesToRender.length === 0) {
		const zonesList = (config.zones && config.zones.length > 0) ? config.zones : [{ name: 'Πρωί' }, { name: 'Απόγευμα' }];
		dzonesToRender = zonesList.map(z => ({
			zone: z,
			rounds: [null, null]
		}));
	}

	dzonesToRender.forEach(dzone => {
		const zoneName = (dzone.zone && dzone.zone.name) ? dzone.zone.name : '';
		let roundsToRender = dzone.rounds && dzone.rounds.length > 0 ? dzone.rounds : [null, null];

		roundsToRender.forEach((round, rIndex) => {
			const label = (rIndex === 0) ? zoneName : '';
			const cellValues = [];

			cols.forEach(col => {
				if (!round) {
					cellValues.push('-');
					return;
				}
				const slot = col.court in round.slots ? round.slots[col.court] : undefined;
				const match = slot?.match;
				if (match?.sport?.name === col.sport.name) {
					if ('id' in match.team_home && 'id' in match.team_away) {
						cellValues.push([match.team_home.id, match.team_away.id].join('-'));
					} else {
						cellValues.push(match.id);
					}
				} else {
					cellValues.push('-');
				}
			});

			rows.push({
				zoneName: label,
				cells: cellValues
			});
		});
	});

	return rows;
}

function exportToExcel() {
	if (!window.currentProgram || window.currentProgram.length === 0) {
		alert("Δεν υπάρχει διαθέσιμο πρόγραμμα για εξαγωγή. Παρακαλώ υποβάλετε τη διαμόρφωση πρώτα.");
		return;
	}

	const program = window.currentProgram;
	const dayBoxColSpan = 6; // Zone + 5 court columns

	let xml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<!--[if gte mso 9]>
<xml>
 <x:ExcelWorkbook>
  <x:ExcelWorksheets>
   <x:ExcelWorksheet>
    <x:Name>Πρόγραμμα Πρωταθλήματος</x:Name>
    <x:WorksheetOptions>
     <x:DisplayGridlines/>
    </x:WorksheetOptions>
   </x:ExcelWorksheet>
  </x:ExcelWorksheets>
 </x:ExcelWorkbook>
</xml>
<![endif]-->
<style>
  table { border-collapse: collapse; font-family: 'Times New Roman', Times, serif; font-size: 11pt; }
  td, th { text-align: center; vertical-align: middle; padding: 4px 6px; }
  .day-header { border: 1px solid #000000; font-weight: bold; text-align: center; font-size: 11pt; background-color: #FFFFFF; }
  .cell-border { border: 1px solid #000000; font-size: 11pt; background-color: #FFFFFF; }
  .zone-cell { border: 1px solid #000000; font-weight: bold; text-align: left; padding-left: 6px; font-size: 11pt; background-color: #FFFFFF; }
  .gap-col { width: 15px; border: none !important; background-color: #FFFFFF; }
  .gap-row { height: 15px; }
</style>
</head>
<body>
<table>
`;

	for (let i = 0; i < program.length; i += 3) {
		const batch = program.slice(i, i + 3);

		// Header Row for the 3 Day boxes
		xml += `<tr>`;
		batch.forEach((day, bIndex) => {
			const dateStr = day.date.toLocaleDateString('el', {
				weekday: 'long',
				day: '2-digit',
				month: 'long',
				year: 'numeric'
			});
			xml += `<th colspan="${dayBoxColSpan}" class="day-header">${dateStr}</th>`;
			if (bIndex < batch.length - 1) {
				xml += `<td class="gap-col"></td>`;
			}
		});
		xml += `</tr>`;

		// Extract rows for each day in batch
		const batchRows = batch.map(day => getDayRowsForExcel(day));
		const maxRows = Math.max(...batchRows.map(r => r.length));

		for (let r = 0; r < maxRows; r++) {
			xml += `<tr>`;
			batch.forEach((day, bIndex) => {
				const rowObj = batchRows[bIndex][r];
				if (rowObj) {
					xml += `<td class="zone-cell">${rowObj.zoneName}</td>`;
					rowObj.cells.forEach(val => {
						xml += `<td class="cell-border">${val}</td>`;
					});
				} else {
					xml += `<td class="zone-cell"></td>`;
					for (let c = 0; c < 5; c++) {
						xml += `<td class="cell-border"></td>`;
					}
				}
				if (bIndex < batch.length - 1) {
					xml += `<td class="gap-col"></td>`;
				}
			});
			xml += `</tr>`;
		}

		if (i + 3 < program.length) {
			xml += `<tr class="gap-row"><td colspan="25" style="border: none;"></td></tr>`;
		}
	}

	xml += `</table></body></html>`;

	const blob = new Blob(['\uFEFF' + xml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
	const link = document.createElement('a');
	const url = URL.createObjectURL(blob);
	link.href = url;
	link.download = 'programma_championships.xls';
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}

document.addEventListener('DOMContentLoaded', () => {
	const excelBtn = document.getElementById('excel');
	if (excelBtn) {
		excelBtn.addEventListener('click', exportToExcel);
	}
});
