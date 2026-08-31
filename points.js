/*
 * the points: what the last sheet of the workbook worked out.
 *
 * the template gave every sport a block of columns — PLD W D L GF GA GD PTS RNK
 * — and ranked the teams inside a band of five rows. the bands were the groups,
 * written out by hand because a sheet cannot ask the configuration what the
 * groups are. here it can, so a group gets a table of its own however many teams
 * it holds, and the ranking is inside the group, which is also what a knockout
 * reading kg1:1 means by it.
 *
 * the columns are the template's, the points of a score are the sport's own, and
 * the rank is the one RANK.EQ gave: two teams level on points share a place.
 */

const POINTS_LEGEND = [
	['PLD', 'Αγώνες'],
	['W', 'Νίκες'],
	['D', 'Ισοπαλίες'],
	['L', 'Ήττες'],
	['GF', 'Υπέρ'],
	['GA', 'Κατά'],
	['GD', 'Διαφορά'],
	['PTS', 'Βαθμοί'],
	['RNK', 'Θέση'],
];

function points_explain(cell, symbol) {
	const found = POINTS_LEGEND.find(one => one[0] === symbol);
	if (found === undefined)
		return;
	cell.dataset.tooltip = found[1];
	cell.tabIndex = 0;
	cell.setAttribute('aria-label', `${symbol}: ${found[1]}`);
}

/**
 * @param {Element} sheet
 * @returns {void}
 */
function points_draw(sheet) {
	const total = {};
	config.teams.forEach(team => {
		total[team.id] = { team: team, pts: 0, pld: 0 };
	});

	config.sports.forEach((sport, i) => {
		const groups = Object.values(config.groups).filter(group => group.sport.name === sport.name);
		const knockouts = Object.values(config.knockouts).filter(kn => kn.sport.name === sport.name);
		if (groups.length === 0 && knockouts.length === 0)
			return;

		const block = document.createElement('section');
		block.classList.add('points-sport');
		block.dataset.sportIndex = i;
		sheet.appendChild(block);

		const name = document.createElement('h3');
		name.classList.add('points-sport-name');
		name.textContent = sport.name;
		block.appendChild(name);

		const tables = document.createElement('div');
		tables.classList.add('points-tables');
		block.appendChild(tables);

		groups.forEach(group => {
			const rows = wb_standings_of(group);
			rows.forEach(row => {
				//a team plays several sports, and the championship is all of them
				//added up
				total[row.team.id].pts += row.pts;
				total[row.team.id].pld += row.pld;
			});
			tables.appendChild(points_table(group.id, rows, wb_has_draw(sport), true));
		});

		if (knockouts.length)
			block.appendChild(points_knockouts(knockouts));
	});

	//the championship itself: every sport a team played, added together
	const rows = Object.values(total).filter(row => row.pld > 0);
	if (rows.length) {
		rows.sort((a, b) => b.pts - a.pts || a.team.id - b.team.id);
		rows.forEach(row => {
			row.rnk = 1 + rows.filter(other => other.pts > row.pts).length;
		});
		const block = document.createElement('section');
		block.classList.add('points-sport', 'points-total');
		sheet.appendChild(block);
		const name = document.createElement('h3');
		name.classList.add('points-sport-name');
		name.textContent = 'Γενική βαθμολογία';
		block.appendChild(name);
		const table = document.createElement('table');
		table.classList.add('points-table');
		block.appendChild(table);
		const thead = document.createElement('thead');
		table.appendChild(thead);
		const head_row = document.createElement('tr');
		thead.appendChild(head_row);
		['', 'team', 'PLD', 'PTS', 'RNK'].forEach(text => {
			const cell = document.createElement('th');
			cell.scope = 'col';
			cell.textContent = text;
			points_explain(cell, text);
			head_row.appendChild(cell);
		});
		const body = document.createElement('tbody');
		table.appendChild(body);
		rows.forEach(row => {
			const tr = document.createElement('tr');
			body.appendChild(tr);
			[String(row.team.id), row.team.name, String(row.pld), String(row.pts), String(row.rnk)].forEach((text, c) => {
				const cell = document.createElement(c === 1 ? 'th' : 'td');
				if (c === 1)
					cell.scope = 'row';
				cell.classList.add(c === 0 ? 'points-id' : (c === 1 ? 'points-team' : 'points-num'));
				if (c === 3)
					cell.classList.add('points-pts');
				cell.textContent = text;
				tr.appendChild(cell);
			});
		});
	}

}

/**
 * a group as a table: the columns of the template, and the D one only for a
 * sport that can be drawn at all.
 *
 * @param {string} title
 * @param {object[]} rows - as wb_standings hands them out
 * @param {boolean} draws
 * @param {boolean} ranked
 * @returns {Element}
 */
function points_table(title, rows, draws, ranked) {
	const box = document.createElement('div');
	box.classList.add('points-group');

	const name = document.createElement('h4');
	name.classList.add('points-group-name');
	name.textContent = title;
	box.appendChild(name);

	const table = document.createElement('table');
	table.classList.add('points-table');
	box.appendChild(table);

	const cols = ['', 'team', 'PLD', 'W'];
	if (draws)
		cols.push('D');
	cols.push('L', 'GF', 'GA', 'GD', 'PTS');
	if (ranked)
		cols.push('RNK');

	const thead = document.createElement('thead');
	table.appendChild(thead);
	const head_row = document.createElement('tr');
	thead.appendChild(head_row);
	cols.forEach(text => {
		const cell = document.createElement('th');
		cell.scope = 'col';
		cell.textContent = text;
		points_explain(cell, text);
		head_row.appendChild(cell);
	});

	const body = document.createElement('tbody');
	table.appendChild(body);
	rows.forEach(row => {
		const tr = document.createElement('tr');
		if (row.pld === 0)
			tr.classList.add('points-unplayed');
		body.appendChild(tr);

		const id = document.createElement('td');
		id.classList.add('points-id');
		id.textContent = String(row.team.id);
		tr.appendChild(id);

		const team = document.createElement('th');
		team.scope = 'row';
		team.classList.add('points-team');
		team.textContent = row.team.name;
		tr.appendChild(team);

		//the columns after the name, in the order the header names them
		cols.slice(2).forEach(what => {
			const value = { PLD: row.pld, W: row.w, D: row.d, L: row.l, GF: row.gf, GA: row.ga, GD: row.gd, PTS: row.pts, RNK: row.rnk }[what];
			const cell = document.createElement('td');
			cell.classList.add('points-num');
			if (what === 'PTS')
				cell.classList.add('points-pts');
			if (what === 'RNK') {
				cell.classList.add('points-rnk');
				//a place two teams are level on is not a place either of them holds
				if (row.tied)
					cell.title = 'ισοβαθμία';
			}
			//a difference reads as one, so the sign of it is written out
			cell.textContent = what === 'GD' && value > 0 ? '+' + value : String(value);
			tr.appendChild(cell);
		});
	});
	return box;
}

/**
 * the knockouts of a sport as they stand: who has come through to each of them
 * and, once it has been played, how it went. they are worth no points, which is
 * how the workbook counted them too.
 *
 * @param {knockout[]} knockouts
 * @returns {Element}
 */
function points_knockouts(knockouts) {
	const box = document.createElement('div');
	box.classList.add('points-knockouts');

	const name = document.createElement('h4');
	name.classList.add('points-group-name');
	name.textContent = 'Νοκ άουτ';
	box.appendChild(name);

	const list = document.createElement('table');
	list.classList.add('points-table', 'points-kn-table');
	box.appendChild(list);
	const body = document.createElement('tbody');
	list.appendChild(body);

	knockouts.forEach(kn => {
		const game = wb_knockout_game(kn.id);
		const home = wb_side(kn.home, {});
		const away = wb_side(kn.away, {});
		const result = game === null ? { sh: null, sa: null } : wb_result(game);
		const played = result.sh !== null && result.sa !== null;

		const tr = document.createElement('tr');
		if (!played)
			tr.classList.add('points-unplayed');
		body.appendChild(tr);

		const code = document.createElement('th');
		code.scope = 'row';
		code.classList.add('points-id');
		code.textContent = kn.id;
		tr.appendChild(code);

		const side = (id, union, won) => {
			const cell = document.createElement('td');
			cell.classList.add('points-team');
			if (id === null)
				cell.classList.add('pages-open');
			if (won)
				cell.classList.add('points-won');
			cell.textContent = id === null ? wb_side_label(union) : wb_team_name(id);
			tr.appendChild(cell);
		};
		side(home, kn.home, played && result.sh > result.sa);

		const score = document.createElement('td');
		score.classList.add('points-num', 'points-kn-score');
		score.textContent = played ? `${result.sh} – ${result.sa}` : '–';
		tr.appendChild(score);

		side(away, kn.away, played && result.sa > result.sh);
	});
	return box;
}

/**
 * the points on their own, for a score that has just been typed on the pages:
 * drawing the pages again would take the box away from under the hand typing in
 * it.
 *
 * @returns {void}
 */
function points_refresh() {
	const panel = document.getElementById('sheet-points');
	if (panel === null)
		return;
	wb_recount();
	if (typeof panel.replaceChildren === 'function')
		panel.replaceChildren();
	else
		panel.textContent = '';
	points_draw(panel);
}
