let matches = [];
let crts = {};

function deepCopy(obj){//simple deepCopy recursive function
	if (typeof obj !== 'object' || obj === null){
		return obj;
	}
	if (obj instanceof Date){
		return new Date(obj);
	}
	let copy;
	if (Array.isArray(obj)){
		copy = [];
		for (let i = 0; i < obj.length; i++){
			copy[i] = deepCopy(obj[i]);
		}
	}
	else {
		copy = {};
		for (let key in obj){
			if (obj.hasOwnProperty(key)){
				copy[key] = deepCopy(obj[key]);
			}
		}
	}
	return copy;
}

function shuffle(array) {
	let currentIndex = array.length
	let randomIndex;
	while (currentIndex != 0){
		randomIndex = Math.floor(Math.random() * currentIndex);
		currentIndex--;
		
		[array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
	}
	return array;
}



function pair_teams(remaining_games,group,matches){
	if (Object.values(remaining_games).every(value => value === 0)){
		return matches;
	}
	else {
		//debugger;
		for (let i=0; i<group.teams.length; i++){
			let gr_teams=[...group.teams];
			while(gr_teams.length>0 && !Object.values(remaining_games).every(value => value === 0)){
				randomj = Math.floor(Math.random() * gr_teams.length);
				let ta=gr_teams[randomj];
				let th=group.teams[i];
				if (remaining_games[ta.name] > 0 && remaining_games[th.name] > 0){
					let scheduled = false;
					matches.forEach(m => {
						if ((th.name === m.team_home.name || ta.name === m.team_home.name) && (th.name === m.team_away.name || ta.name === m.team_away.name) && (group.sport.name === m.sport.name)){
							scheduled = true;
						}
					});

					if (!scheduled && th.name!==ta.name){

						let newMatches=deepCopy(matches);
						newMatches.push({
							id: group.id,
							sport: group.sport,
							team_home: th,
							team_away: ta,
							score_home: null,
							score_away: null,
							points: 0,
						});
						let new_rem = {...remaining_games};
						new_rem[th.name]-=1;
						new_rem[ta.name]-=1;
						result=pair_teams(new_rem,group,newMatches);
						if (result){
							return result;
						}
					}
				}
				gr_teams = gr_teams.filter((element) => element.name !== ta.name);
			}
		}
	}
}


//builds the matches of every group and of every knockout. the group matches that
//do not come out of a plain round robin are paired at random, so every call may
//hand out a different set of them.
function produce_matches() {
	matches = [];

	// produce court metric (to know which court has more games in a given time)
	//built afresh rather than added to: the courts of a configuration submitted
	//earlier would otherwise stay in it, and the scheduler, which walks these
	//names to find the slots of a round, would look for a court that has none
	crts = {};
	config.courts.forEach(court => {
		crts[court] = 0;
	});

	//produce matches from groups
	Object.values(config.groups).forEach(gr => {
		if (gr.matches){//the matches of the group are given one by one, so there is nothing to produce
			gr.matches.forEach(gm => {
				matches.push({
					id: gr.id,
					sequence: 0, //all given matches belong to the same phase
					sport: gr.sport,
					team_home: gm.team_home,
					team_away: gm.team_away,
					score_home: null,
					score_away: null,
					points: 0,
				});
			});
			return;
		}
		let total_matches = (gr.team_matches * gr.teams.length)/2;
		if (total_matches % ((gr.teams.length * (gr.teams.length - 1)) / 2) === 0){ //if the teams play against each other x times exactly. 
			for (let i = 0; i < gr.team_matches/(gr.teams.length-1); i++){
				gr.teams.forEach(th => {//TODO->away and home teams must be different in the next phase if phases >1 in a group.
					gr.teams.forEach(ta => {
						if (th.id >= ta.id)
							return;
						matches.push({
							id: gr.id,
							sequence: i, //i need this to schedule the >1 phases of a group correctly (the same match must be placed after )
							sport: gr.sport,
							//slot: null, finally no need for this!
							team_home: th,
							team_away: ta,
							score_home: null,
							score_away: null,
							points: 0,
						});
					});
				});
			}
		}
		else{//if teams do not play all games against each other but only specific amount of them in a group < all the possible games against all teams once.
			try{
				if (gr.team_matches * gr.teams.length % 2 === 0){
					let remaining_games = {};
					gr.teams.forEach(t => {
						remaining_games[t.name] = gr.team_matches;
						//console.log(remaining_games,gr);
					});
					matches=pair_teams(remaining_games,gr,matches);
				}
				else{
					throw new Error(`cannot produce this number of games per team for this number of teams`);
				}
			}
			catch(error){
				alert(error.toString());
			}
		}
	});

	//produce matches from knockouts
	Object.values(config.knockouts).forEach(kn => {
		matches.push({
			id: kn.id,
			sport: kn.sport,
			team_home: kn.home,
			team_away: kn.away,
			score_home: null,
			score_away: null,
			points: 0,
		});
	});

	for (let m = 0; m < matches.length; m++){
		if (isBaseballGroupMatch(matches[m])){
			matches[m].points = 100;
		}
	}
	console.log('matches: ' + matches.length);
	return matches;
}


/*
 * the search
 *
 * a window of the search holds the browser for as long as its time limit, so the
 * windows are run one after the other with a pause in between. the pause is what
 * lets the page draw the count of the attempts and take a stop from the user.
 */

const SEARCH_WINDOW_MS = 3000; //the time limit that used to end the whole search
const SEARCH_PAUSE_MS = 50; //handed to the browser between two windows
const SEARCH_STRICT_TRIES = 5; //attempts before the adjacent round rules are dropped

let search = null;

/**
 * the teams that are actually going to play: the ones a group holds, the ones a
 * given match names, and the ones a knockout starts with. a team may be declared
 * and then left out of every one of them.
 *
 * @returns {team[]}
 */
function playing_teams() {
	const playing = {};
	const add = team => {
		if (team && typeof team.id !== 'undefined')
			playing[team.id] = true;
	};
	Object.values(config.groups).forEach(gr => {
		(gr.teams || []).forEach(add);
		(gr.matches || []).forEach(gm => {
			add(gm.team_home);
			add(gm.team_away);
		});
	});
	Object.values(config.knockouts).forEach(kn => {
		[kn.home, kn.away].forEach(side => {
			if (side && side.type === 'fixed')
				add(side.team);
		});
	});
	return config.teams.filter(team => team.id in playing);
}

/**
 * what is worth saying about a configuration without refusing it. a team that is
 * declared and never plays is almost always a mistake, and nothing else in the
 * program would ever mention it.
 *
 * @returns {string[]}
 */
function config_notices() {
	const notices = [];
	const playing = playing_teams();
	const idle = config.teams.filter(team => !playing.includes(team));
	if (idle.length)
		notices.push(idle.length === 1
			? `Η ομάδα ${idle[0].name} δεν παίζει σε κανέναν αγώνα.`
			: `Οι ομάδες ${idle.map(team => team.name).join(', ')} δεν παίζουν σε κανέναν αγώνα.`);
	return notices;
}

function config_report(notices) {
	const box = document.getElementById('notice');
	if (box === null)
		return;
	box.textContent = notices.join(' ');
	box.hidden = notices.length === 0;
}

/**
 * the search runs until it finds a program, so a configuration that can never be
 * scheduled would keep it running for ever. these look for a proof that no
 * program exists and report only what they can prove, so that a configuration
 * which is merely hard is still searched.
 *
 * @returns {string[]} - the reasons no program exists, empty when none is found
 */
function search_impossible() {
	const reasons = [];

	let rounds = 0;
	config.days.forEach(day => day.dzones.forEach(dzone => {
		rounds += dzone.rounds.length;
	}));
	if (rounds === 0) {
		reasons.push('η διαμόρφωση δεν ορίζει κανέναν γύρο');
		return reasons;
	}

	//the matches every group and every knockout is going to produce
	const bySport = {};
	let total = 0;
	config.sports.forEach(sport => {
		bySport[sport.name] = 0;
	});
	Object.values(config.groups).forEach(gr => {
		const n = gr.matches ? gr.matches.length : (gr.team_matches * gr.teams.length) / 2;
		bySport[gr.sport.name] += n;
		total += n;
	});
	Object.values(config.knockouts).forEach(kn => {
		bySport[kn.sport.name] += 1;
		total += 1;
	});

	//a sport is played on its own courts only, and so is any set of sports
	//together on the courts they share between them
	const over = [];
	for (let mask = 1; mask < (1 << config.sports.length); mask++) {
		const chosen = config.sports.filter((sport, i) => mask & (1 << i));
		const courts = [];
		let need = 0;
		chosen.forEach(sport => {
			need += bySport[sport.name];
			sport.courts.forEach(court => {
				if (!courts.includes(court))
					courts.push(court);
			});
		});
		if (need > courts.length * rounds)
			over.push({ mask: mask, chosen: chosen, need: need, courts: courts.length });
	}
	//every set holding one that is already over is over as well, so only the
	//smallest ones are worth telling
	over.filter(one => !over.some(other => other.mask !== one.mask && (other.mask & one.mask) === other.mask))
		.forEach(one => {
			reasons.push(`${one.chosen.map(sport => sport.name).join(' + ')}: ${one.need} αγώνες, αλλά ${one.courts} γήπεδα x ${rounds} γύροι = ${one.courts * rounds} θέσεις`);
		});

	//a round holds as many matches as the teams allow: the scheduler takes a match
	//only while used slots x 2 < teams - 1. a team that is declared and never
	//plays does not widen a round, so it is not counted here.
	const playing = playing_teams().length;
	const maxPerRound = Math.max(1, Math.ceil((playing - 1) / 2));
	const perRound = Math.min(config.courts.length, maxPerRound);
	if (total > rounds * perRound) {
		reasons.push(`${total} αγώνες συνολικά, αλλά ${rounds} γύροι x ${perRound} ταυτόχρονοι αγώνες = ${rounds * perRound} θέσεις (${playing} ομάδες επιτρέπουν ${maxPerRound} αγώνες ανά γύρο)`);
	}

	//the baseball match that brings a team to the sport holds a zone of two rounds
	//on its own, and one match brings at most two teams
	const bbTeams = {};
	Object.values(config.groups).forEach(gr => {
		if (gr.sport.name !== BASEBALL_SPORT)
			return;
		gr.teams.forEach(team => {
			bbTeams[team.id] = true;
		});
	});
	const bbCount = Object.keys(bbTeams).length;
	if (bbCount > 0) {
		let zones = 0;
		config.days.forEach((day, d) => day.dzones.forEach((dzone, dz) => {
			if (dzone.rounds.length >= 2 && !(d === 0 && dz === 0))
				zones++;
		}));
		const needed = Math.ceil(bbCount / 2);
		if (needed > zones) {
			reasons.push(`${bbCount} ομάδες παίζουν ${BASEBALL_SPORT} και χρειάζονται τουλάχιστον ${needed} ζώνες των 2 γύρων, ενώ η διαμόρφωση δίνει ${zones}`);
		}
	}

	return reasons;
}

//one window of the search: a fresh set of matches, then as many orderings of it
//as fit in the time limit. returns the program, or null if the window ran out.
function search_run_window() {
	produce_matches();
	let program = null;
	window.startTime = Date.now();
	while (Date.now() - window.startTime < SEARCH_WINDOW_MS) {
		let currentMatches = shuffle([...matches]);
		//the scheduler puts the matches straight into the calendar it is given and
		//takes them back out again, so every ordering starts from its own copy and
		//the configuration keeps a clean one even when a window runs out mid way
		let currentDays = deepCopy(config.days);
		try {
			program = ScheduleMatchesDefault(currentMatches, currentDays);
			if (program)
				break;
		} catch (error) {
			if (error.message === "TIMEOUT")
				break;
			if (error.message === "ATTEMPT_TIMEOUT")
				continue;
			throw error;
		}
	}
	return program ? program : null;
}

function search_seconds() {
	return Math.round((Date.now() - search.started) / 1000);
}

//a match as it is named in a complaint: the two sides when they are known, and
//the name of the knockout when they are not yet
function match_label(m) {
	const home = m.team_home && typeof m.team_home.name === 'string' ? m.team_home.name : null;
	const away = m.team_away && typeof m.team_away.name === 'string' ? m.team_away.name : null;
	return `${m.sport.name} ${home !== null && away !== null ? home + '–' + away : m.id}`;
}

/**
 * how close the search has come, so that a configuration which keeps failing
 * says what it is failing on rather than only how many times it has tried.
 *
 * @returns {string} - empty until the search has got somewhere
 */
function search_progress() {
	if (schedule_best_left === Infinity || matches.length === 0)
		return '';
	const placed = matches.length - schedule_best_left;
	if (schedule_best_left === 0)
		return '';
	const left = schedule_best_unplaced.slice(0, 3).map(match_label).join(', ')
		+ (schedule_best_unplaced.length > 3 ? ` και ${schedule_best_unplaced.length - 3} ακόμη` : '');
	return ` Το πιο κοντινό ως τώρα: ${placed} από ${matches.length} αγώνες, έμεινε ${left}.`;
}

function search_tries(n) {
	return n === 1 ? '1 προσπάθεια' : `${n} προσπάθειες`;
}

/**
 * @param {string} text - what the search has to say
 * @param {?boolean} over - true when there is nothing left to stop
 * @param {?string} state - 'busy', 'ok', 'error' or 'stopped', which only tells
 *                          the page how to draw the line, not what to do with it
 */
function search_report(text, over, state) {
	console.log(text);
	const box = document.getElementById('search');
	const status = document.getElementById('search-status');
	const stop = document.getElementById('stop');
	if (box === null || status === null)
		return;
	box.hidden = false;
	status.textContent = text;
	const shown = state ? state : (over === true ? 'ok' : 'busy');
	['busy', 'ok', 'error', 'stopped'].forEach(one => {
		box.classList.toggle('is-' + one, one === shown);
	});
	if (stop !== null)
		stop.hidden = over === true;
}

//a search may run for long, so the answer is also told outside the page
function search_notify(text) {
	if (typeof Notification === 'undefined' || Notification.permission !== 'granted')
		return;
	try {
		new Notification('Ομαδικά Πρωταθλήματα', { body: text });
	} catch (error) {
		console.log(error);
	}
}

function search_window() {
	if (search === null || search.stopped)
		return;
	search.windows++;
	//the adjacent round rules are preferences, so after the first attempts the
	//search also looks for a program without them. dropping them helps some
	//configurations and hurts others, since a rule that forbids also prunes, so
	//the attempts take turns rather than leaving the stricter ones behind.
	relax_adjacency = search.windows > SEARCH_STRICT_TRIES && search.windows % 2 === 0;
	if (search.windows > SEARCH_STRICT_TRIES && !search.relaxed) {
		search.relaxed = true;
		const text = `Μετά από ${SEARCH_STRICT_TRIES} προσπάθειες δεν βρέθηκε πρόγραμμα. Η αναζήτηση δοκιμάζει πλέον και χωρίς τους κανόνες που κρατούν μια ομάδα εκτός δύο συνεχόμενων γύρων, εναλλάξ με αυτούς.`;
		search_report(text);
		search_notify(text);
	}
	search_report(`Αναζήτηση προγράμματος: προσπάθεια ${search.windows}${relax_adjacency ? ' (χαλαρωμένοι κανόνες)' : ''}… (${search_seconds()} δευτ.)`);
	let program = null;
	try {
		program = search_run_window();
	} catch (error) {
		search = null;
		search_report(`Η αναζήτηση σταμάτησε: ${error.message}`, true, 'error');
		alert(error.toString());
		return;
	}
	if (search === null || search.stopped) //stopped while the window was running
		return;
	if (program === null) {
		//the time limit was hit, which is not the end any more: say so and try again
		search_report(`Το όριο των ${SEARCH_WINDOW_MS / 1000} δευτ. εξαντλήθηκε στην προσπάθεια ${search.windows}, νέα προσπάθεια… (${search_seconds()} δευτ.)`
			+ search_progress());
		if (search.windows === 1) //told once, so that a search left alone is not silent
			search_notify(`Το όριο των ${SEARCH_WINDOW_MS / 1000} δευτ. εξαντλήθηκε. Η αναζήτηση συνεχίζεται μόνη της.`);
		setTimeout(search_window, SEARCH_PAUSE_MS);
		return;
	}
	//a program found without the adjacent round rules may put a team in the same
	//sport twice in a row, which the user has to know
	const text = `Το πρόγραμμα βρέθηκε στην προσπάθεια ${search.windows} (${search_seconds()} δευτ.).`
		+ (relax_adjacency ? ' Οι κανόνες για δύο συνεχόμενους γύρους ήταν χαλαρωμένοι, οπότε μια ομάδα μπορεί να παίζει το ίδιο άθλημα σε δύο συνεχόμενους γύρους.' : '');
	search = null;
	search_report(text, true, 'ok');
	search_notify(text);
	try {
		displayer(program); // IDEA save 'program' globally and trigger 'championships_program_ready'
	} catch (error) {
		alert(error.toString());
	}
}

function search_stop() {
	if (search === null)
		return;
	const text = `Η αναζήτηση σταμάτησε μετά από ${search_tries(search.windows)} (${search_seconds()} δευτ.).`
		+ search_progress();
	search.stopped = true;
	search = null;
	search_report(text, true, 'stopped');
}

function search_start() {
	if (search !== null) //a submit during a search starts it over
		search.stopped = true;
	search = null;
	relax_adjacency = false;
	schedule_forget_best();
	if (typeof sheets_clear === 'function')
		sheets_clear();
	//the program on the page belongs to the previous configuration, and so does
	//anything that would be handed out of it: the three tabs go with it
	const previous = document.getElementById('program');
	if (previous !== null) {
		if (typeof previous.replaceChildren === 'function')
			previous.replaceChildren();
		else
			previous.textContent = '';
	}
	const excel_button = document.getElementById('excel');
	if (excel_button !== null)
		excel_button.disabled = true;

	//what is worth knowing about the configuration but does not stop it
	config_report(config_notices());

	//no point searching for ever for something that cannot exist
	const reasons = search_impossible();
	if (reasons.length) {
		search_report('Η διαμόρφωση δεν μπορεί να προγραμματιστεί. ' + reasons.join(' · '), true, 'error');
		return;
	}

	search = {
		windows: 0,
		started: Date.now(),
		stopped: false,
		relaxed: false,
	};
	//a browser only takes the request on an action of the user, such as the submit
	if (typeof Notification !== 'undefined' && Notification.permission === 'default')
		Notification.requestPermission();
	search_report('Αναζήτηση προγράμματος…');
	//let the page draw before a window takes the browser
	setTimeout(search_window, 0);
}

document.addEventListener('championships_config_parsed', () => {
	console.log('started');
	search_start();
})

document.addEventListener('DOMContentLoaded', () => {
	const stop = document.getElementById('stop');
	if (stop !== null)
		stop.addEventListener('click', search_stop);
});
