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

function exportToExcel() {
	if (!window.currentProgram || window.currentProgram.length === 0) {
		alert("Δεν υπάρχει διαθέσιμο πρόγραμμα για εξαγωγή. Παρακαλώ υποβάλετε τη διαμόρφωση πρώτα.");
		return;
	}

	const program = window.currentProgram;

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
  table { border-collapse: collapse; font-family: Calibri, Arial, sans-serif; font-size: 11pt; }
  th, td { border: 1px solid #000000; padding: 6px 12px; text-align: center; vertical-align: middle; }
  th { background-color: #1F4E78; color: #FFFFFF; font-weight: bold; font-size: 12pt; }
  .day-header { background-color: #D9E1F2; color: #000000; font-weight: bold; font-size: 11pt; text-align: left; }
  .zone-header { background-color: #F2F2F2; color: #000000; font-weight: bold; }
  .match-cell { font-weight: bold; }
  .empty-cell { color: #7F7F7F; }
</style>
</head>
<body>
<table>
<thead>
  <tr>
    <th style="width: 220px;">Ημερομηνία</th>
    <th style="width: 120px;">Ζώνη</th>
    <th style="width: 100px;">Γύρος</th>`;

	cols.forEach(col => {
		xml += `<th style="width: 130px;">${col.court}</th>`;
	});

	xml += `</tr>
</thead>
<tbody>`;

	program.forEach(day => {
		const dateStr = day.date.toLocaleDateString('el', {
			weekday: 'long',
			day: '2-digit',
			month: 'long',
			year: 'numeric'
		});

		day.dzones.forEach(dzone => {
			if (dzone.rounds.length === 0) return;
			const zoneName = (config.zones.length !== 1 || config.zones[0].name !== null) ? dzone.zone.name : '-';

			dzone.rounds.forEach((round, rIndex) => {
				xml += `<tr>`;
				xml += `<td class="day-header">${dateStr}</td>`;
				xml += `<td class="zone-header">${zoneName}</td>`;
				xml += `<td>Γύρος ${rIndex + 1}</td>`;

				cols.forEach(col => {
					const slot = col.court in round.slots ? round.slots[col.court] : undefined;
					const match = slot?.match;
					let val = '-';
					if (match?.sport?.name === col.sport.name) {
						if ('id' in match.team_home && 'id' in match.team_away) {
							val = [match.team_home.id, match.team_away.id].join('-');
						} else {
							val = match.id;
						}
					}

					if (val === '-') {
						xml += `<td class="empty-cell">-</td>`;
					} else {
						xml += `<td class="match-cell">${val}</td>`;
					}
				});

				xml += `</tr>`;
			});
		});
	});

	xml += `</tbody></table></body></html>`;

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
