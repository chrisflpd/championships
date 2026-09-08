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
	configuration: '', // original text, kept with the plan even while the form is edited
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
		const raw = appStorage.getItem(WB_STORE);
		return raw === null ? null : JSON.parse(raw);
	} catch (error) {
		return null;
	}
}

function wb_snapshot() {
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
	return { sig: workbook.sig, configuration: workbook.configuration, plan, results: workbook.results };
}

// History stores plain data, never live game objects. One swap of a round or
// zone is one step. A new/restored championship starts a new history.
const wb_history = { past: [], future: [], current: null };
function wb_history_reset() {
	wb_history.past = [];
	wb_history.future = [];
	wb_history.current = JSON.stringify(wb_snapshot());
}

function wb_history_step(redo) {
	const source = redo ? wb_history.future : wb_history.past;
	if (!source.length) return;
	const target = redo ? wb_history.past : wb_history.future;
	target.push(wb_history.current);
	const state = source.pop();
	const saved = JSON.parse(state);
	workbook.offered = saved.plan;
	workbook.results = saved.results;
	wb_restore(false);
	wb_history.current = state;
	wb_save();
	sheets_draw();
}

function wb_history_buttons() {
	const undo = document.getElementById('plan-undo'), redo = document.getElementById('plan-redo');
	if (undo) undo.disabled = !wb_history.past.length;
	if (redo) redo.disabled = !wb_history.future.length;
}

function wb_save() {
	const state = JSON.stringify(wb_snapshot());
	if (wb_history.current !== null && state !== wb_history.current) {
		wb_history.past.push(wb_history.current);
		if (wb_history.past.length > 100) wb_history.past.shift();
		wb_history.future = [];
	}
	wb_history.current = state;
	wb_history_buttons();
	try {
		appStorage.setItem(WB_STORE, state);
		if (workbook.configuration) appStorage.setItem('config', workbook.configuration);
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
	config.sports.filter(sport => sport.tiebreakers).forEach(sport =>
		parts.push('tb' + sport.name + ':' + sport.tiebreakers.join(',')));
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
	workbook.configuration = config.text;

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
	wb_history_reset();
}

/**
 * puts back the plan a previous visit left, which is the one the camp worked on
 * by hand rather than the one the search has just found.
 *
 * @returns {boolean} - whether there was one to put back
 */
function wb_restore(resetHistory = true) {
	if (workbook.offered === null)
		return false;
	const slots = {};
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
	}
	workbook.slots = slots;
	workbook.offered = null;
	if (resetHistory) wb_history_reset();
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

/**
 * exchanges the contents of slots two at a time, all of them at once: a whole
 * round or a whole zone changing places with another.
 *
 * the two of a pair are the same field, so nothing is played anywhere it was not
 * being played before — only at another hour.
 *
 * @param {string[][]} pairs - [from, to] keys
 * @returns {void}
 */
function wb_swap(pairs) {
	//read first and write after, or a pair written early would be read late
	const held = {};
	pairs.forEach(pair => pair.forEach(key => {
		held[key] = workbook.slots[key];
	}));
	pairs.forEach(pair => {
		[[pair[0], held[pair[1]]], [pair[1], held[pair[0]]]].forEach(one => {
			if (one[1] === undefined)
				delete workbook.slots[one[0]];
			else
				workbook.slots[one[0]] = one[1];
		});
	});
	wb_save();
}

//every slot of one round, a field at a time
function wb_round_keys(iso, zone_rank, round_rank) {
	return config.courts.map(court => wb_key(iso, zone_rank, round_rank, court));
}

/**
 * the pairs that put one round where another is, field by field.
 *
 * @param {string} from - iso|zone|round
 * @param {string} to
 * @returns {string[][]}
 */
function wb_round_pairs(from, to) {
	const one = from.split('|'), other = to.split('|');
	return config.courts.map(court => [
		wb_key(one[0], one[1], one[2], court),
		wb_key(other[0], other[1], other[2], court),
	]);
}

/**
 * the pairs that put one zone where another is, round by round and field by
 * field. a zone with more rounds than the other keeps what will not fit.
 *
 * @param {string} from - iso|zone
 * @param {string} to
 * @returns {string[][]}
 */
function wb_zone_pairs(from, to) {
	const rounds = id => {
		const parts = id.split('|');
		const day = workbook.calendar.filter(one => one.iso === parts[0])[0];
		if (day === undefined)
			return [];
		const dzone = day.dzones.filter(one => String(one.zone.rank) === parts[1])[0];
		return dzone === undefined ? [] : dzone.rounds;
	};
	const mine = rounds(from), theirs = rounds(to);
	const pairs = [];
	for (let r = 0; r < Math.min(mine.length, theirs.length); r++)
		wb_round_pairs(from + '|' + mine[r].rank, to + '|' + theirs[r].rank)
			.forEach(pair => pairs.push(pair));
	return pairs;
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
	//each one is read as a sentence of its own under a bullet, so each one is
	//written as one
	const said = [];
	const parts = key.split('|');
	const court = parts[3];
	if (!game.sport.courts.includes(court))
		said.push(`Το ${court} δεν είναι γήπεδο για ${game.sport.name}`);
	if (game.kn === null && game.home === game.away)
		said.push('Η ομάδα παίζει με τον εαυτό της');
	const round_prefix = parts.slice(0, 3).join('|') + '|';
	const here = [game.home, game.away].filter(id => id !== null);
	for (const other_key in workbook.slots) {
		if (other_key === key || other_key.indexOf(round_prefix) !== 0)
			continue;
		const other = workbook.slots[other_key];
		[other.home, other.away].forEach(id => {
			if (id !== null && here.includes(id))
				said.push(`Η ${wb_team_name(id)} παίζει ήδη στον ίδιο γύρο`);
		});
	}
	return said;
}


/* --------------------------------------------- what is worth a second look */

/*
 * the rules above are the ones a plan cannot be played without. these are the
 * ones the search keeps and the camp may set aside: the same pair twice in a
 * morning, the baseball spread a zone at a time, the finals in their order. a
 * plan that breaks one of them can be played perfectly well — it is simply not
 * the plan the search would have found — so they are said more quietly.
 *
 * they are worked out against the plan as it stands rather than as it is being
 * built, so a few of them read as "this one comes before that one" where the
 * search read them as "not yet".
 */

//where every round of the calendar stands, so that two matches can be told
//which of them comes first
let wb_place_cache = null;

function wb_places() {
	if (wb_place_cache !== null)
		return wb_place_cache;
	wb_place_cache = { at: {}, where: {} };
	let at = 0;
	workbook.calendar.forEach((day, d) => day.dzones.forEach((dzone, dz) => dzone.rounds.forEach((round, r) => {
		const id = [day.iso, dzone.zone.rank, round.rank].join('|');
		wb_place_cache.at[id] = at++;
		wb_place_cache.where[id] = { day: day, dzone: dzone, round: round, d: d, dz: dz, r: r };
	})));
	return wb_place_cache;
}

//the day, the zone and the round a slot belongs to
function wb_round_id(key) {
	return key.split('|').slice(0, 3).join('|');
}

function wb_where(key) {
	const found = wb_places().where[wb_round_id(key)];
	return found === undefined ? null : found;
}

function wb_at_place(key) {
	const found = wb_places().at[wb_round_id(key)];
	return found === undefined ? -1 : found;
}

//every match of the plan with where it stands, in the order they are played
let wb_plan_cache = null;

function wb_plan() {
	if (wb_plan_cache !== null)
		return wb_plan_cache;
	const places = wb_places().at;
	wb_plan_cache = [];
	for (const key in workbook.slots) {
		wb_plan_cache.push({
			key: key,
			game: workbook.slots[key],
			at: places[wb_round_id(key)] === undefined ? -1 : places[wb_round_id(key)],
			court: key.split('|')[3],
		});
	}
	wb_plan_cache.sort((one, other) => one.at - other.at);
	return wb_plan_cache;
}

//the two sides of a game, by id, leaving out a knockout that is still waiting
function wb_pair(game) {
	return [game.home, game.away].filter(id => id !== null);
}

function wb_same_pair(one, other) {
	const mine = wb_pair(one), theirs = wb_pair(other);
	return mine.length === 2 && theirs.length === 2
		&& mine.includes(theirs[0]) && mine.includes(theirs[1]);
}

//a group where every team plays every other more than once is played in phases,
//and the phases are played one after the other
function wb_group_phases(group) {
	if (group === undefined || group.matches)
		return false;
	if (group.teams.length < 2)
		return false;
	const phases = group.team_matches / (group.teams.length - 1);
	return group.team_matches % (group.teams.length - 1) === 0 && phases !== 1;
}

function wb_knockout_fed(kn) {
	return [kn.home, kn.away].some(union => union && union.type === 'knockout');
}

//the match that brings a team to baseball for the first time: the one the zones
//are spread over
function wb_baseball_intro(game, at, baseball) {
	if (game.sport.name !== BASEBALL_SPORT || game.kn !== null)
		return false;
	return wb_pair(game).some(id =>
		!baseball.some(one => one.at < at && wb_pair(one.game).includes(id)));
}

/**
 * what is worth a second look about a slot: the rules the search keeps, read
 * against the plan as it stands.
 *
 * @param {string} key
 * @returns {string[]}
 */
function wb_cautions(key) {
	const game = wb_at(key);
	if (game === null)
		return [];
	const said = [];
	const parts = key.split('|');
	const iso = parts[0], zone_rank = Number(parts[1]), court = parts[3];
	const here = wb_pair(game);
	const where = wb_where(key);
	if (where === null)
		return [];
	const at = wb_at_place(key);
	const plan = wb_plan();
	const name = id => wb_team_name(id);
	const both = () => `Η ${name(here[0])} και η ${name(here[1])}`;

	const in_round = plan.filter(one => wb_round_id(one.key) === wb_round_id(key));
	const in_zone = plan.filter(one => one.key.indexOf(iso + '|' + zone_rank + '|') === 0);
	const in_day = plan.filter(one => one.key.indexOf(iso + '|') === 0);
	const beside = in_zone.filter(one => {
		const there = wb_where(one.key);
		return there !== null && Math.abs(there.r - where.r) === 1;
	});

	/* the round */

	//a round holds as many matches as the teams allow: the scheduler takes one
	//only while the used slots leave two teams free
	const most = Math.floor((config.teams.length - 1) / 2);
	if (in_round.length > most)
		said.push(`Ο γύρος έχει ${in_round.length} αγώνες, ενώ οι ${config.teams.length} ομάδες επιτρέπουν έως ${most}`);

	/* the zone */

	//the same pair again in the same zone
	if (here.length === 2 && in_zone.some(one => one.key !== key && wb_same_pair(game, one.game)))
		said.push(`${both()} συναντιούνται ξανά στην ίδια ζώνη`);

	//a zone that is full and holds a handful of group matches plays everybody. a
	//zone is the rounds the configuration gave it — the band the page draws holds
	//the ones it did not, and the search was never offered those.
	const given_rounds = where.dzone.rounds.filter(round => round.given).length;
	if (given_rounds >= 2 && in_zone.length === config.courts.length * given_rounds
		&& in_zone.filter(one => one.game.kn === null).length >= 5) {
		const played = {};
		in_zone.forEach(one => wb_pair(one.game).forEach(id => {
			played[id] = true;
		}));
		const idle = config.teams.filter(team => !(team.id in played));
		if (idle.length)
			said.push(`Η ζώνη είναι γεμάτη, αλλά δεν παίζει σε αυτήν η ${idle.map(team => team.name).join(', η ')}`);
	}

	/* the day */

	if (here.length === 2 && in_day.some(one => one.key !== key
		&& one.game.sport.name === game.sport.name && wb_same_pair(game, one.game)))
		said.push(`${both()} παίζουν ${game.sport.name} ξανά την ίδια ημέρα`);

	/* the rounds beside */

	//a team at the same sport in the round beside. the rounds beside a slot are
	//rounds of its own zone, so that is where it is said to happen.
	beside.forEach(one => {
		if (one.game.sport.name !== game.sport.name)
			return;
		wb_pair(one.game).forEach(id => {
			if (here.includes(id)) {
				const line = `Η ${name(id)} παίζει ${game.sport.name} ξανά σε αυτήν τη ζώνη`;
				if (!said.includes(line))
					said.push(line);
			}
		});
	});

	/* the arrival */

	if (where.d === 0 && where.dz === 0 && config.teams.length > 0 && here.includes(config.teams[0].id))
		said.push(`Η ομάδα αγάπης (${config.teams[0].name}) δεν έπρεπε να παίζει στη δεύτερη πρωινή ζώνη της πρώτης ημέρας`);

	/* baseball */

	const baseball = plan.filter(one => one.game.sport.name === BASEBALL_SPORT && one.game.kn === null);
	if (wb_baseball_intro(game, at, baseball)) {
		//every one of these begins the same way, since it is the same thing about
		//the match that brings them on
		const brings = 'Ο αγώνας φέρνει ομάδα στο μπέιζμπολ για πρώτη φορά, αλλά';
		if (where.r !== 0)
			said.push(`${brings} δεν παίζεται στον πρώτο γύρο της ζώνης`);
		if (given_rounds < 2)
			said.push(`${brings} η ζώνη δεν έχει δύο γύρους`);
		if (in_zone.some(one => one.key !== key && one.game.sport.name === BASEBALL_SPORT && one.game.kn === null))
			said.push(`${brings} η ζώνη έχει ήδη αγώνα μπέιζμπολ`);
		//the zones take one each in turn, so none of the earlier ones is passed over
		const passed = [];
		workbook.calendar.forEach(day => day.dzones.forEach(dzone => {
			if (dzone.rounds.filter(round => round.given).length < 2)
				return;
			const prefix = day.iso + '|' + dzone.zone.rank + '|';
			if (wb_at_place(prefix + dzone.rounds[0].rank + '|') >= at)
				return;
			if (!plan.some(one => one.key.indexOf(prefix) === 0
				&& one.game.sport.name === BASEBALL_SPORT && one.game.kn === null))
				passed.push(dzone);
		}));
		if (passed.length)
			said.push(`${brings} ${passed.length === 1
				? 'προηγούμενη ζώνη δύο γύρων έμεινε χωρίς μπέιζμπολ'
				: `${passed.length} προηγούμενες ζώνες δύο γύρων έμειναν χωρίς μπέιζμπολ`}`);
	}

	//the diamond is laid out over another sport's field, so that field is left
	//free in the round after a match that brings a team to the sport. it is the
	//field the baseball was played on that is asked for, whatever it is called.
	if (where.r > 0) {
		const before_key = wb_key(iso, zone_rank, where.dzone.rounds[where.r - 1].rank, court);
		const before = wb_at(before_key);
		if (before !== null && wb_baseball_intro(before, wb_at_place(before_key), baseball))
			said.push(`Το ${court} έπρεπε να μείνει ελεύθερο: στον προηγούμενο γύρο έγινε ο πρώτος αγώνας μπέιζμπολ μιας ομάδας`);
	}

	/* the order things are played in */

	if (game.kn === null && wb_group_phases(config.groups[game.id])) {
		const mine = game.occ || 0;
		if (plan.some(one => one.game.kn === null && one.game.id === game.id
			&& (one.game.occ || 0) < mine && one.at > at))
			said.push(`Ο όμιλος ${game.id} παίζεται σε φάσεις, και αυτός ο αγώνας προηγείται αγώνων προηγούμενης φάσης`);
	}

	if (game.kn !== null) {
		const kn = config.knockouts[game.kn];
		if (plan.some(one => one.game.kn === null && one.game.sport.name === game.sport.name && one.at > at))
			said.push(`Το νοκ άουτ ${game.kn} παίζεται πριν τελειώσουν οι όμιλοι του ${game.sport.name}`);

		if (kn !== undefined && !wb_knockout_fed(kn) && plan.some(one => one.at < at
			&& one.game.kn !== null && config.knockouts[one.game.kn] !== undefined
			&& config.knockouts[one.game.kn].sport.name === game.sport.name
			&& wb_knockout_fed(config.knockouts[one.game.kn])))
			said.push(`Το ${game.kn} παίρνει ομάδες από ομίλους, αλλά παίζεται μετά από νοκ άουτ που παίρνει ομάδα από άλλο νοκ άουτ`);

		if (kn !== undefined) {
			[kn.home, kn.away].forEach(union => {
				if (!union || union.type !== 'knockout')
					return;
				const feeder = plan.filter(one => one.game.kn === union.knockout.id)[0];
				if (feeder === undefined || feeder.at >= at)
					said.push(`Το ${game.kn} παίζεται πριν από το ${union.knockout.id}, από το οποίο παίρνει ομάδα`);
			});
		}

		//the match for the losers is played before the one for the winners
		if (kn !== undefined && [kn.home, kn.away].some(union => union && union.type === 'knockout' && union.is_winner)) {
			Object.values(config.knockouts).forEach(other => {
				if (other.id === kn.id)
					return;
				const shares = [other.home, other.away].some(union => union && union.type === 'knockout' && !union.is_winner
					&& [kn.home, kn.away].some(mine => mine && mine.type === 'knockout' && mine.knockout.id === union.knockout.id));
				if (!shares)
					return;
				const found = plan.filter(one => one.game.kn === other.id)[0];
				if (found !== undefined && found.at > at)
					said.push(`Ο τελικός ${kn.id} παίζεται πριν από τον μικρό τελικό ${other.id}`);
			});
		}

		//the baseball final is the first final played
		if (wb_knockout_stage(game.kn) === 'f') {
			const bb_final = Object.values(config.knockouts).filter(one =>
				one.sport.name === BASEBALL_SPORT && wb_knockout_stage(one.id) === 'f')[0];
			if (bb_final !== undefined) {
				if (game.sport.name !== BASEBALL_SPORT) {
					const found = plan.filter(one => one.game.kn === bb_final.id)[0];
					if (found === undefined || found.at >= at)
						said.push(`Ο τελικός ${game.kn} παίζεται πριν από τον τελικό του ${BASEBALL_SPORT}, που παίζεται πρώτος από όλους`);
				} else if (plan.some(one => one.at < at && one.game.kn !== null
					&& wb_knockout_stage(one.game.kn) === 'f')) {
					said.push(`Ο τελικός του ${BASEBALL_SPORT} παίζεται μετά από άλλον τελικό, ενώ παίζεται πρώτος από όλους`);
				}
			}
		}
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
	// RNK remains points-only; FRNK is the unique, qualification order.
	rows.forEach(row => {
		row.rnk = 1 + rows.filter(other => other.pts > row.pts).length;
		row.tied = rows.some(other => other !== row && other.pts === row.pts);
	});
	return wb_final_ranks(group, rows);
}

// Evaluate head-to-head only for a complete, balanced set of mutual fixtures.
// Two teams compare wins; 3+ compare mini-table points under their sport's rules.
function wb_mini_table(group, rows, fixtures) {
	const ids = new Set(rows.map(row => row.team.id));
	const stat = new Map(rows.map(row => [row.team.id, { pts: 0, w: 0, gf: 0, ga: 0, gd: 0 }]));
	const counts = new Map();
	for (const game of fixtures) {
		if (!ids.has(game.home) || !ids.has(game.away)) continue;
		if (game.home === game.away) return null;
		const result = wb_result(game);
		if (result.sh === null || result.sa === null) return null;
		let points;
		try { points = group.sport.points_fn(result.sh, result.sa); }
		catch (error) { return null; }
		const pair = [game.home, game.away].sort((a, b) => a - b).join(':');
		counts.set(pair, (counts.get(pair) || 0) + 1);
		const home = stat.get(game.home), away = stat.get(game.away);
		home.pts += points[0]; away.pts += points[1];
		home.w += Number(result.sh > result.sa); away.w += Number(result.sa > result.sh);
		home.gf += result.sh; away.gf += result.sa;
		home.ga += result.sa; away.ga += result.sh;
		home.gd += result.sh - result.sa; away.gd += result.sa - result.sh;
	}
	if (counts.size !== rows.length * (rows.length - 1) / 2 || new Set(counts.values()).size !== 1)
		return null;
	return stat;
}

function wb_final_ranks(group, rows) {
	const rules = tiebreak_order(group.sport);
	const fixtures = wb_placed().filter(p => p.game.kn === null && p.game.id === group.id).map(p => p.game);
	const complete = fixtures.length > 0 && fixtures.every(game => wb_played(game));
	function resolve(tied, path) {
		if (tied.length === 1) {
			tied[0].rank_reason = path.join(' → ');
			return tied;
		}
		const mini = wb_mini_table(group, tied, fixtures);
		for (const rule of rules) {
			if (rule.startsWith('μεταξύ_τους') && mini === null) {
				continue;
			}
			const value = row => {
				switch (rule) {
					case 'μεταξύ_τους': return mini.get(row.team.id)[tied.length === 2 ? 'w' : 'pts'];
					case 'μεταξύ_τους_διαφορά': return mini.get(row.team.id).gd;
					case 'μεταξύ_τους_υπέρ': return mini.get(row.team.id).gf;
					case 'μεταξύ_τους_κατά': return -mini.get(row.team.id).ga;
					case 'συνολική_διαφορά': return row.gd;
					case 'συνολικά_υπέρ': return row.gf;
					case 'συνολικές_νίκες': return row.w;
					case 'συνολικά_κατά': return -row.ga;
					case 'id': return -row.team.id;
				}
			};
			const buckets = new Map();
			for (const row of tied) {
				const score = value(row);
				if (!buckets.has(score)) buckets.set(score, []);
				buckets.get(score).push(row);
			}
			if (buckets.size === 1) continue;
			// Restart only on strictly smaller subgroups: bounded recursion, never
			// a pairwise comparator that becomes inconsistent for circular wins.
			return [...buckets].sort((a, b) => b[0] - a[0]).flatMap(([score, subset]) =>
				resolve(subset, path.concat(TIEBREAK_CRITERIA[rule])));
		}
		throw new Error('Λείπει το τελικό κριτήριο id.');
	}
	const buckets = new Map();
	for (const row of rows) {
		if (!buckets.has(row.pts)) buckets.set(row.pts, []);
		buckets.get(row.pts).push(row);
	}
	const ordered = [...buckets].sort((a, b) => b[0] - a[0]).flatMap(([pts, tied]) => resolve(tied, []));
	ordered.forEach((row, index) => {
		row.frnk = index + 1;
		row.rank_provisional = !complete;
	});
	return ordered;
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

// A shared first letter identifies the sport, which its column already names.
// Only shorten presentation labels; stored IDs and knockout references stay intact.
function wb_display_id(id) {
	const owner = config.groups[id] || config.knockouts[id];
	if (!owner) return id;
	const groups = Object.values(config.groups).filter(one => one.sport.name === owner.sport.name);
	const knockouts = Object.values(config.knockouts).filter(one => one.sport.name === owner.sport.name);
	const prefix = Array.from(id)[0];
	if (!prefix || !/^\p{L}$/u.test(prefix) || !groups.length || !knockouts.length) return id;
	return groups.concat(knockouts).every(one => one.id.startsWith(prefix) && one.id.length > prefix.length)
		? id.slice(prefix.length) : id;
}

function wb_plan_label(game) {
	if (game.kn === null)
		return `${game.home}-${game.away}`;
	const sides = wb_sides(game);
	if (sides.home === null || sides.away === null)
		return wb_display_id(game.kn);
	return `${sides.home}${wb_knockout_stage(game.kn)}${sides.away}`;
}

//how a place still to be filled is read: the group and the ranking, or the
//knockout and which of its two teams
function wb_side_label(union) {
	if (!union)
		return '';
	if (union.type === 'fixed')
		return union.team.name;
	if (union.type === 'group')
		return `${union.rank}η θέση ομίλου ${union.group.id}`;
	if (union.type === 'knockout')
		return `${union.is_winner ? 'Νικητής' : 'Ηττημένος'} ${union.knockout.id}`;
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
	wb_place_cache = null;
	wb_plan_cache = null;
}
