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

let search = null;

//one window of the search: a fresh set of matches, then as many orderings of it
//as fit in the time limit. returns the program, or null if the window ran out.
function search_run_window() {
	produce_matches();
	let program = null;
	window.startTime = Date.now();
	while (Date.now() - window.startTime < SEARCH_WINDOW_MS) {
		let currentMatches = shuffle([...matches]);
		try {
			program = ScheduleMatchesDefault(currentMatches, config.days);
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

function search_tries(n) {
	return n === 1 ? '1 προσπάθεια' : `${n} προσπάθειες`;
}

function search_report(text, over) {
	console.log(text);
	const box = document.getElementById('search');
	const status = document.getElementById('search-status');
	const stop = document.getElementById('stop');
	if (box === null || status === null)
		return;
	box.hidden = false;
	status.textContent = text;
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
	search_report(`Αναζήτηση προγράμματος: προσπάθεια ${search.windows}… (${search_seconds()} δευτ.)`);
	let program = null;
	try {
		program = search_run_window();
	} catch (error) {
		search = null;
		search_report(`Η αναζήτηση σταμάτησε: ${error.message}`, true);
		alert(error.toString());
		return;
	}
	if (search === null || search.stopped) //stopped while the window was running
		return;
	if (program === null) {
		//the time limit was hit, which is not the end any more: say so and try again
		search_report(`Το όριο των ${SEARCH_WINDOW_MS / 1000} δευτ. εξαντλήθηκε στην προσπάθεια ${search.windows}, νέα προσπάθεια… (${search_seconds()} δευτ.)`);
		if (search.windows === 1) //told once, so that a search left alone is not silent
			search_notify(`Το όριο των ${SEARCH_WINDOW_MS / 1000} δευτ. εξαντλήθηκε. Η αναζήτηση συνεχίζεται μόνη της.`);
		setTimeout(search_window, SEARCH_PAUSE_MS);
		return;
	}
	const text = `Το πρόγραμμα βρέθηκε στην προσπάθεια ${search.windows} (${search_seconds()} δευτ.).`;
	search = null;
	search_report(text, true);
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
	const text = `Η αναζήτηση σταμάτησε μετά από ${search_tries(search.windows)} (${search_seconds()} δευτ.).`;
	search.stopped = true;
	search = null;
	search_report(text, true);
}

function search_start() {
	if (search !== null) //a submit during a search starts it over
		search.stopped = true;
	search = {
		windows: 0,
		started: Date.now(),
		stopped: false,
	};
	//a browser only takes the request on an action of the user, such as the submit
	if (typeof Notification !== 'undefined' && Notification.permission === 'default')
		Notification.requestPermission();
	//the program on the page belongs to the previous configuration
	const previous = document.querySelector('.day-list');
	if (previous !== null)
		previous.remove();
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
