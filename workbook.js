/*
 * the workbook behind the three tabs.
 *
 * the template carried three sheets the camp never reads. teams turned an id
 * into the single character a pair is written with, fields turned a court into a
 * column of the plan, and games read that plan back, split every pair into two
 * teams, fetched the score off the pages sheet and handed the points sheet a row
 * it could add up. none of the three is worth a tab, so all of it is here, and
 * the plan, the pages and the points ask this for whatever they draw.
 *
 * two things are kept across a reload: the plan, so that a match moved by hand
 * stays where it was put, and the scores, which are kept against the match
 * rather than against the slot, so that a fresh search moving a match somewhere
 * else does not lose its result.
 */

const WB_STORE = 'workbook';

const workbook = {
	sig: '',        // the configuration these games belong to
	calendar: [],   // every date from the first to the last, the passed over ones included
	cols: [],       // one entry per sport and court pair: the columns of the plan
	slots: {},      // slot key -> game, holding only the slots that carry one
	results: {},    // match identity -> the score and the referee
	offered: null,  // a plan a previous visit left, waiting to be asked for
};


/* ------------------------------------------------------------- the round band */

/*
 * the configuration says which rounds the search may use, and the camp has
 * always had four a day whatever it said: the two of the morning and the two of
 * the afternoon. a day the configuration passes over, and a round it leaves out
 * of a day it gives, are times the camp holds and chose not to play in — not
 * times that do not exist. all four are therefore drawn and can be filled by
 * hand; only the search is held to what the configuration gave.
 */

//the rounds the template gives a day. read rather than repeated, and read
//through a guard, since the export declares it and may not be loaded yet.
function wb_day_rounds() {
	try {
		return PLAN_ROUNDS;
	} catch (error) {
		return 4;
	}
}

/**
 * how many rounds a zone is given room for on every day: the most it ever holds
 * in the configuration, and never fewer than its share of the day.
 *
 * @param {day[]} program
 * @returns {object.<number, number>} - rows by the rank of the zone
 */
function wb_capacity(program) {
	const capacity = {};
	config.zones.forEach(zone => {
		capacity[zone.rank] = 1;
	});
	program.forEach(day => day.dzones.forEach(dzone => {
		capacity[dzone.zone.rank] = Math.max(capacity[dzone.zone.rank] || 1, dzone.rounds.length);
	}));
	//the day is shared out equally between the zones, so a zone takes its share
	//of it whether or not the configuration asked for that many
	const day_rounds = wb_day_rounds();
	if (config.zones.length > 0 && day_rounds % config.zones.length === 0) {
		const band = day_rounds / config.zones.length;
		config.zones.forEach(zone => {
			capacity[zone.rank] = Math.max(capacity[zone.rank], band);
		});
	}
	return capacity;
}

/**
 * the rounds of one zone of one day: the ones the configuration gives, and the
 * rest of the band beside them.
 *
 * @param {round[]} given - the rounds the configuration gives, in order
 * @param {number} capacity - how many the zone has room for
 * @param {boolean} arrival - the first zone of the first day
 * @returns {object[]} - {rank, given, row}, in the order they are read in
 */
function wb_rounds(given, capacity, arrival) {
	//on the arrival morning the rounds that are held are the last of the band,
	//the ones before them taken by the arrival itself, which is where the
	//template puts them as well
	const offset = arrival && given.length < capacity ? capacity - given.length : 0;
	const rounds = [];
	//a round the configuration did not give still needs a rank of its own to be
	//keyed by, and the given ones have taken the first of them
	let spare = given.length;
	for (let row = 0; row < capacity; row++) {
		const at = row - offset;
		rounds.push(at >= 0 && at < given.length
			? { rank: given[at].rank, given: true, row: row }
			: { rank: spare++, given: false, row: row });
	}
	return rounds;
}

/**
 * whether anything at all is played in a round, which is what tells a round the
 * camp has filled in by hand from one it has left alone.
 *
 * @param {object} day - a day of the calendar
 * @param {object} dzone
 * @param {object} round
 * @returns {boolean}
 */
function wb_round_used(day, dzone, round) {
	return workbook.cols.some(col => wb_at(wb_key(day.iso, dzone.zone.rank, round.rank, col.court)) !== null);
}


/* ---------------------------------------------------------------- the pieces */

//the dates are read out of an iso day, so they are midnight utc and the day they
//name is the same one in every timezone the page is opened in
function wb_iso(date) {
	return date.toISOString().slice(0, 10);
}

/**
 * the template names every team by a single character, so that a pair of them
 * fits one cell of the plan: the digits first, then the letters.
 *
 * @param {number} id
 * @returns {string}
 */
function wb_char(id) {
	return id <= 9 ? String(id) : String.fromCharCode(64 + id - 9);
}

function wb_team(id) {
	return config.teams.filter(team => team.id === id)[0] || null;
}

function wb_team_name(id) {
	const team = wb_team(id);
	return team === null ? '' : team.name;
}

function wb_sport(name) {
	return config.sports.filter(sport => sport.name === name)[0] || null;
}

//where a slot is: the day, the zone and the round of the calendar, and the field
function wb_key(iso, zone_rank, round_rank, court) {
	return [iso, zone_rank, round_rank, court].join('|');
}

/**
 * a sport that cannot be drawn throws on a level score rather than returning
 * points for it, which is also how the page knows whether to draw a D column.
 *
 * @param {sport} sport
 * @returns {boolean}
 */
function wb_has_draw(sport) {
	try {
		sport.points_fn(1, 1);
		return true;
	} catch (error) {
		return false;
	}
}

/**
 * what a match is called wherever it turns up, so that a score entered against
 * it is still its score after another search has put it in another round. a
 * knockout is named by its code, since its two sides are not known yet; a group
 * match by its group and the two teams playing it.
 *
 * @param {?object} game
 * @returns {string}
 */
function wb_ident(game) {
	if (!game)
		return '';
	if (game.kn !== null)
		return 'k:' + game.kn;
	//a group where every team plays more than once against each of the others
	//holds the same pair twice over, and the two are not the same match, so each
	//of them carries which of the two it is
	return 'g:' + game.id + ':' + game.home + '-' + game.away + '#' + (game.occ || 0);
}

//the number that tells one meeting of a pair from the next: the lowest that
//nothing else is already using
function wb_next_occ(id, home, away, except) {
	const used = {};
	for (const key in workbook.slots) {
		const other = workbook.slots[key];
		if (key === except || other.kn !== null)
			continue;
		if (other.id === id && other.home === home && other.away === away)
			used[other.occ || 0] = true;
	}
	let occ = 0;
	while (used[occ])
		occ++;
	return occ;
}

/* ------------------------------------------------------------ what is stored */

function wb_stored() {
	try {
		const raw = localStorage.getItem(WB_STORE);
		return raw === null ? null : JSON.parse(raw);
	} catch (error) {
		return null;
	}
}

function wb_save() {
	const plan = {};
	for (const key in workbook.slots) {
		const game = workbook.slots[key];
		plan[key] = {
			sport: game.sport.name,
			id: game.id,
			kn: game.kn,
			home: game.home,
			away: game.away,
			occ: game.occ,
		};
	}
	try {
		localStorage.setItem(WB_STORE, JSON.stringify({
			sig: workbook.sig,
			plan: plan,
			results: workbook.results,
		}));
	} catch (error) {
		console.log(error);
	}
}

/**
 * the configuration the stored plan belongs to. everything the calendar and the
 * matches are drawn from goes in, so that a plan is only ever put back on the
 * configuration it was made for.
 *
 * @returns {string}
 */
function wb_signature() {
	const parts = [];
	config.sports.forEach(sport => parts.push('s' + sport.name + ':' + sport.courts.join(',')));
	config.zones.forEach(zone => parts.push('z' + zone.name));
	config.days.forEach(day => parts.push('d' + wb_iso(day.date) + ':' + day.dzones.map(dzone => dzone.rounds.length).join(',')));
	config.teams.forEach(team => parts.push('t' + team.id + team.name));
	Object.values(config.groups).forEach(group => parts.push('g' + group.id + group.sport.name
		+ ':' + group.teams.map(team => team.id).join(',')
		+ ':' + (group.matches || []).map(gm => gm.team_home.id + 'v' + gm.team_away.id).join(',')));
	Object.values(config.knockouts).forEach(kn => parts.push('k' + kn.id + kn.sport.name));
	return parts.join('|');
}


/* ------------------------------------------------------------------ the build */

function wb_game_of(match, court, occ) {
	const kn = match.id in config.knockouts ? match.id : null;
	return {
		sport: match.sport,
		court: court,
		id: match.id,
		kn: kn,
		//a knockout is two places still to be filled, so it has no teams to name
		home: kn === null ? match.team_home.id : null,
		away: kn === null ? match.team_away.id : null,
		occ: occ,
	};
}

/**
 * builds the workbook out of the program the search found, then puts back
 * whatever a previous visit left for this very configuration.
 *
 * @param {day[]} program
 * @returns {void}
 */
function wb_build(program) {
	workbook.sig = wb_signature();

	workbook.cols = [];
	config.sports.forEach(sport => {
		sport.courts.forEach(court => {
			workbook.cols.push({ sport: sport, court: court });
		});
	});

	const capacity = wb_capacity(program);
	workbook.calendar = calendar_days(program).map((day, d) => ({
		date: day.date,
		iso: wb_iso(day.date),
		blank: day.blank === true,
		dzones: day.dzones.map((dzone, dz) => ({
			zone: dzone.zone,
			rounds: wb_rounds(dzone.rounds, capacity[dzone.zone.rank] || 1, d === 0 && dz === 0),
		})),
	}));

	workbook.slots = {};
	//the meetings of a pair are numbered as they are come across, so that a group
	//playing every pair twice keeps the two apart
	const seen = {};
	program.forEach(day => {
		const iso = wb_iso(day.date);
		day.dzones.forEach(dzone => dzone.rounds.forEach(round => {
			Object.values(round.slots).forEach(slot => {
				if (!slot.match)
					return;
				const match = slot.match;
				const pair = match.id + ':' + (match.team_home.id || '') + '-' + (match.team_away.id || '');
				const occ = seen[pair] === undefined ? 0 : seen[pair] + 1;
				seen[pair] = occ;
				workbook.slots[wb_key(iso, dzone.zone.rank, round.rank, slot.court)] = wb_game_of(match, slot.court, occ);
			});
		}));
	});

	const stored = wb_stored();
	const mine = stored !== null && stored.sig === workbook.sig;
	//a score belongs to the match and not to the slot, so it is put straight back:
	//wherever this search has placed that match, the result of it is still its own
	workbook.results = mine && stored.results ? stored.results : {};
	//a plan is not, though. the search was asked for a new program and it found
	//one, so that is what is drawn; the plan the camp left is offered instead of
	//being forced back over it.
	workbook.offered = mine && stored.plan && Object.keys(stored.plan).length ? stored.plan : null;
}

/**
 * puts back the plan a previous visit left, which is the one the camp worked on
 * by hand rather than the one the search has just found.
 *
 * @returns {boolean} - whether there was one to put back
 */
function wb_restore() {
	if (workbook.offered === null)
		return false;
	const slots = {};
	let kept = 0;
	for (const key in workbook.offered) {
		const one = workbook.offered[key];
		const sport = wb_sport(one.sport);
		if (sport === null)
			continue;
		slots[key] = {
			sport: sport,
			court: key.split('|')[3],
			id: one.id,
			kn: one.kn === undefined ? null : one.kn,
			home: one.home === undefined ? null : one.home,
			away: one.away === undefined ? null : one.away,
			occ: one.occ === undefined ? 0 : one.occ,
		};
		kept++;
	}
	if (!kept)
		return false;
	workbook.slots = slots;
	workbook.offered = null;
	return true;
}


/* -------------------------------------------------------- reading the workbook */

/**
 * whether a game is the one drawn in a column.
 *
 * a court may belong to two sports and so have a column for each of them, while
 * a slot is the court itself, since only one match can be played on it at a
 * time. a game therefore stands under the column of its own sport. one put by
 * hand on a court its sport does not play on has no column of its own, and
 * stands in the first column of that court rather than disappearing off the
 * page with nothing to say it has gone.
 *
 * @param {object} game
 * @param {object} col
 * @param {number} index - where the column is among the others
 * @returns {boolean}
 */
function wb_shows(game, col, index) {
	if (game.sport.name === col.sport.name)
		return true;
	if (workbook.cols.some(other => other.court === col.court && other.sport.name === game.sport.name))
		return false;
	return workbook.cols.findIndex(other => other.court === col.court) === index;
}

/**
 * every slot of the calendar that carries a match, in reading order.
 *
 * @returns {object[]} - {key, day, dzone, round, col, game}
 */
function wb_placed() {
	const out = [];
	workbook.calendar.forEach(day => day.dzones.forEach(dzone => dzone.rounds.forEach(round => {
		workbook.cols.forEach((col, index) => {
			const key = wb_key(day.iso, dzone.zone.rank, round.rank, col.court);
			const game = workbook.slots[key];
			if (game === undefined || !wb_shows(game, col, index))
				return;
			out.push({ key: key, day: day, dzone: dzone, round: round, col: col, game: game });
		});
	})));
	return out;
}

function wb_at(key) {
	const game = workbook.slots[key];
	return game === undefined ? null : game;
}

function wb_result(game) {
	const stored = workbook.results[wb_ident(game)];
	if (stored === undefined)
		return { sh: null, sa: null, ref: '' };
	return {
		sh: typeof stored.sh === 'number' ? stored.sh : null,
		sa: typeof stored.sa === 'number' ? stored.sa : null,
		ref: typeof stored.ref === 'string' ? stored.ref : '',
	};
}

//a match counts only once both scores are in, which is what the played column of
//the template worked out for every row of the games sheet
function wb_played(game) {
	const result = wb_result(game);
	return result.sh !== null && result.sa !== null;
}

function wb_set_result(game, sh, sa, ref) {
	workbook.results[wb_ident(game)] = { sh: sh, sa: sa, ref: ref };
	wb_save();
}


/* ------------------------------------------------------------- changing a plan */

/**
 * moves a match to another slot, swapping with whatever is already there.
 *
 * @param {string} from - slot key
 * @param {string} to - slot key
 * @returns {void}
 */
function wb_move(from, to) {
	if (from === to)
		return;
	const moving = workbook.slots[from];
	if (moving === undefined)
		return;
	const staying = workbook.slots[to];
	const to_court = to.split('|')[3];
	const from_court = from.split('|')[3];
	moving.court = to_court;
	workbook.slots[to] = moving;
	if (staying === undefined) {
		delete workbook.slots[from];
	} else {
		staying.court = from_court;
		workbook.slots[from] = staying;
	}
	wb_save();
}

function wb_set_teams(key, home, away) {
	const game = workbook.slots[key];
	if (game === undefined)
		return;
	game.home = home;
	game.away = away;
	game.occ = wb_next_occ(game.id, home, away, key);
	wb_save();
}

function wb_clear(key) {
	delete workbook.slots[key];
	wb_save();
}

/**
 * puts a match into a slot, over whatever was in it. a group match is numbered
 * so that it is not taken for another meeting of the same pair.
 *
 * @param {string} key - slot key
 * @param {string} id - a group code or a knockout code
 * @param {?number} home - team id, null for a knockout
 * @param {?number} away
 * @returns {void}
 */
function wb_put(key, id, home, away) {
	const kn = id in config.knockouts;
	const sport = kn ? config.knockouts[id].sport : config.groups[id].sport;
	workbook.slots[key] = {
		sport: sport,
		court: key.split('|')[3],
		id: id,
		kn: kn ? id : null,
		home: kn ? null : home,
		away: kn ? null : away,
		occ: kn ? 0 : wb_next_occ(id, home, away, key),
	};
	wb_save();
}

/**
 * what is wrong with a slot without being refused: a field that is not the
 * sport's, and a team playing twice in the one round. the camp is allowed to do
 * both, since a plan being fixed by hand passes through states that do not hold,
 * but it is told.
 *
 * @param {string} key
 * @returns {string[]}
 */
function wb_complaints(key) {
	const game = wb_at(key);
	if (game === null)
		return [];
	const said = [];
	const parts = key.split('|');
	const court = parts[3];
	if (!game.sport.courts.includes(court))
		said.push(`το ${court} δεν είναι γήπεδο για ${game.sport.name}`);
	if (game.kn === null && game.home === game.away)
		said.push('η ομάδα παίζει με τον εαυτό της');
	const round_prefix = parts.slice(0, 3).join('|') + '|';
	const here = [game.home, game.away].filter(id => id !== null);
	for (const other_key in workbook.slots) {
		if (other_key === key || other_key.indexOf(round_prefix) !== 0)
			continue;
		const other = workbook.slots[other_key];
		[other.home, other.away].forEach(id => {
			if (id !== null && here.includes(id))
				said.push(`η ${wb_team_name(id)} παίζει ήδη στον ίδιο γύρο`);
		});
	}
	return said;
}


/* ----------------------------------------------------------------- the points */

/**
 * the standings of a group, out of the matches of that group that have been
 * played. the points of a score are whatever the sport says they are, so
 * football, basketball, volleyball and baseball each add up their own way
 * without any of that being repeated here.
 *
 * @param {group} group
 * @returns {object[]} - a row per team, in the order they are ranked
 */
function wb_standings(group) {
	const stat = {};
	group.teams.forEach(team => {
		stat[team.id] = { team: team, pld: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
	});
	wb_placed().forEach(placed => {
		const game = placed.game;
		if (game.kn !== null || game.id !== group.id)
			return;
		if (!(game.home in stat) || !(game.away in stat))
			return;
		const result = wb_result(game);
		if (result.sh === null || result.sa === null)
			return;
		let points;
		try {
			points = game.sport.points_fn(result.sh, result.sa);
		} catch (error) {
			//a level score in a sport that cannot be drawn is a slip of the pen, so
			//the match is counted as played and worth nothing to either side
			points = [0, 0];
		}
		const home = stat[game.home];
		const away = stat[game.away];
		home.pld++;
		away.pld++;
		home.gf += result.sh;
		home.ga += result.sa;
		away.gf += result.sa;
		away.ga += result.sh;
		home.pts += points[0];
		away.pts += points[1];
		if (result.sh > result.sa) {
			home.w++;
			away.l++;
		} else if (result.sh < result.sa) {
			home.l++;
			away.w++;
		} else {
			home.d++;
			away.d++;
		}
	});
	const rows = Object.values(stat);
	rows.forEach(row => {
		row.gd = row.gf - row.ga;
	});
	//the order is the one a table is read in; the rank is the one the template
	//worked out, where two teams on the same points share a place
	rows.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.team.id - b.team.id);
	rows.forEach(row => {
		row.rnk = 1 + rows.filter(other => other.pts > row.pts).length;
		row.tied = rows.some(other => other !== row && other.pts === row.pts);
	});
	return rows;
}

//the group standings are read again and again while the knockouts are worked
//out, so they are held for the length of one pass
let wb_standings_cache = null;

function wb_standings_of(group) {
	if (wb_standings_cache === null)
		wb_standings_cache = {};
	if (!(group.id in wb_standings_cache))
		wb_standings_cache[group.id] = wb_standings(group);
	return wb_standings_cache[group.id];
}

function wb_knockout_game(id) {
	const found = wb_placed().filter(placed => placed.game.kn === id);
	return found.length ? found[0].game : null;
}

//A ranking is final only after every scheduled group match has a score.
function wb_group_complete(group) {
	const games = wb_placed().filter(placed => placed.game.kn === null && placed.game.id === group.id);
	return games.length > 0 && games.every(placed => wb_played(placed.game));
}

/**
 * the team on one side of a knockout, once whatever it is waiting for has
 * happened, and null while it is still waiting.
 *
 * @param {knunion} union
 * @param {object} seen - the knockouts already being worked out, against a cycle
 * @returns {?number} - team id
 */
function wb_side(union, seen) {
	if (!union)
		return null;
	if (union.type === 'fixed')
		return union.team.id;
	if (union.type === 'group') {
		const row = wb_standings_of(union.group)[union.rank - 1];
		if (row === undefined || !wb_group_complete(union.group))
			return null;
		return row.team.id;
	}
	if (union.type === 'knockout') {
		const id = union.knockout.id;
		if (seen[id])
			return null;
		seen[id] = true;
		const game = wb_knockout_game(id);
		if (game === null)
			return null;
		const result = wb_result(game);
		if (result.sh === null || result.sa === null || result.sh === result.sa)
			return null;
		const home = wb_side(union.knockout.home, seen);
		const away = wb_side(union.knockout.away, seen);
		if (home === null || away === null)
			return null;
		const winner = result.sh > result.sa ? home : away;
		const loser = result.sh > result.sa ? away : home;
		return union.is_winner ? winner : loser;
	}
	return null;
}

function wb_union_uses(union, id) {
	return union && union.type === 'knockout' && union.knockout.id === id;
}

//Finals are terminal winner matches; terminal loser matches are barrages. A
//match directly feeding a final is a semifinal, and any earlier playoff is a
//barrage/qualifier.
function wb_knockout_stage(id) {
	const kn = config.knockouts[id];
	if (kn === undefined)
		return 'b';
	const consumers = Object.values(config.knockouts).filter(other =>
		wb_union_uses(other.home, id) || wb_union_uses(other.away, id));
	if (consumers.length === 0) {
		const loser_match = [kn.home, kn.away].some(union => union && union.type === 'knockout' && !union.is_winner);
		return loser_match ? 'b' : 'f';
	}
	const feeds_final = consumers.some(other => wb_knockout_stage(other.id) === 'f');
	return feeds_final ? 's' : 'b';
}

function wb_plan_label(game) {
	if (game.kn === null)
		return `${wb_char(game.home)}-${wb_char(game.away)}`;
	const sides = wb_sides(game);
	if (sides.home === null || sides.away === null)
		return game.kn;
	return `${wb_char(sides.home)}${wb_knockout_stage(game.kn)}${wb_char(sides.away)}`;
}

//how a place still to be filled is read: the group and the ranking, or the
//knockout and which of its two teams
function wb_side_label(union) {
	if (!union)
		return '';
	if (union.type === 'fixed')
		return union.team.name;
	if (union.type === 'group')
		return `${union.group.id}:${union.rank}`;
	if (union.type === 'knockout')
		return `${union.is_winner ? 'Ν' : 'Η'} ${union.knockout.id}`;
	return '';
}

/**
 * the two sides of a game, worked out rather than stored: a group match names
 * them itself, a knockout is whoever has come through to it.
 *
 * @param {object} game
 * @returns {object} - {home, away, home_label, away_label}
 */
function wb_sides(game) {
	if (game.kn === null) {
		return {
			home: game.home,
			away: game.away,
			home_label: wb_team_name(game.home),
			away_label: wb_team_name(game.away),
		};
	}
	const kn = config.knockouts[game.kn];
	if (kn === undefined)
		return { home: null, away: null, home_label: game.kn, away_label: '' };
	const home = wb_side(kn.home, {});
	const away = wb_side(kn.away, {});
	return {
		home: home,
		away: away,
		home_label: home === null ? wb_side_label(kn.home) : wb_team_name(home),
		away_label: away === null ? wb_side_label(kn.away) : wb_team_name(away),
	};
}

//a pass over the points or the pages reads the same standings many times over,
//so it says when it starts and the held ones are dropped
function wb_recount() {
	wb_standings_cache = null;
}
