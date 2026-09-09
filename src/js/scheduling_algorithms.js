// TODO cptlagou prevent deadlock

let result=null

//the rules that keep a team, or a pair of teams, out of two rounds in a row are
//preferences rather than needs, and a tight calendar may have no program that
//honours them. the search turns this on to look for a program without them.
let relax_adjacency = false;

//how close the search has come: the fewest matches it has ever been left
//holding, and which ones those were. nothing reads these to decide anything —
//they are only so that a search that keeps failing can say what it fails on.
let schedule_best_left = Infinity;
let schedule_best_unplaced = [];

function schedule_forget_best() {
	schedule_best_left = Infinity;
	schedule_best_unplaced = [];
}


function deepCopyObj(obj) {//for deep copy without recursion (because js had enough of it...)
	var copiedArr = [];
	for (var i = 0; i < obj.length; i++) {
		var original = obj[i];
		var copied = {};
		for (var property in original) {
			if (original.hasOwnProperty(property)) {
				var value = original[property];
				if (Array.isArray(value)) {
					copied[property] = value.map(function (item) {
						return Object.assign({}, item);
					});
				}
				else if (typeof value === 'object' && value !== null) {//date not included exactly (nothing changes)
					copied[property] = Object.assign({}, value);
				}
				else {
					copied[property] = value;
				}
			}
		}
		copiedArr.push(copied);
	}
	return copiedArr;
}


//the baseball final is the first final played: every other final waits for it,
//and it waits for none of them. the diamond takes the longest to set up and to
//take down, so it goes first and the pitch is free for the rest of the day.
function finalOutOfOrder(days, m, d, dz, r) {
	if (!isFinalMatch(m)) return false;
	if (m.sport.name !== BASEBALL_SPORT) {
		let hasBaseballFinal = Object.values(config.knockouts).some(k =>
			k.sport.name === BASEBALL_SPORT && isFinalMatch({ id: k.id, sport: k.sport }));
		if (!hasBaseballFinal) return false;
		let baseballFinalSlot = findMatchSlotInDays(days, match =>
			match.sport.name === BASEBALL_SPORT && isFinalMatch(match));
		if (!baseballFinalSlot) return true;
		return !isSlotAfter(d, dz, r, baseballFinalSlot.d, baseballFinalSlot.dz, baseballFinalSlot.r);
	}
	let otherFinalSlot = findMatchSlotInDays(days, match =>
		match.sport.name !== BASEBALL_SPORT && isFinalMatch(match));
	if (!otherFinalSlot) return false;
	return !isSlotAfter(otherFinalSlot.d, otherFinalSlot.dz, otherFinalSlot.r, d, dz, r);
}

function isFinalMatch(m) {
	if (!config.knockouts || !config.knockouts[m.id]) return false;
	for (let k of Object.values(config.knockouts)) {
		if (k.sport.name === m.sport.name) {
			if (k.home && k.home.type === 'knockout' && k.home.knockout.id === m.id) return false;
			if (k.away && k.away.type === 'knockout' && k.away.knockout.id === m.id) return false;
		}
	}
	return true;
}

function findMatchSlotInDays(days, predicate) {
	for (let d = 0; d < days.length; d++) {
		for (let dz = 0; dz < days[d].dzones.length; dz++) {
			for (let r = 0; r < days[d].dzones[dz].rounds.length; r++) {
				for (let s of Object.keys(days[d].dzones[dz].rounds[r].slots)) {
					let match = days[d].dzones[dz].rounds[r].slots[s].match;
					if (match && predicate(match)) {
						return { d, dz, r };
					}
				}
			}
		}
	}
	return null;
}

function isSlotAfter(d1, dz1, r1, d2, dz2, r2) {
	if (d1 > d2) return true;
	if (d1 < d2) return false;
	if (dz1 > dz2) return true;
	if (dz1 < dz2) return false;
	return r1 > r2;
}

function isBaseballGroupMatch(m) {
	return m && m.sport && m.sport.name === BASEBALL_SPORT && typeof m.team_home !== 'undefined' && typeof m.team_home.name !== 'undefined';
}

function hasBaseballGroupMatchInZone(dzone) {
	for (let r = 0; r < dzone.rounds.length; r++) {
		for (let s of Object.keys(dzone.rounds[r].slots)) {
			let match = dzone.rounds[r].slots[s].match;
			if (isBaseballGroupMatch(match)) {
				return true;
			}
		}
	}
	return false;
}

//a baseball group match introduces the sport to a team when that team has no
//baseball match before it. only those matches are spread over the zones, the
//rest are placed like a match of any other sport.
function slotRank(d, dz, r) {
	return d * 10000 + dz * 100 + r;
}

//the slot of the first baseball match of every team, as placed so far
function baseballFirstRanks(days) {
	let ranks = {};
	for (let d = 0; d < days.length; d++) {
		for (let dz = 0; dz < days[d].dzones.length; dz++) {
			for (let r = 0; r < days[d].dzones[dz].rounds.length; r++) {
				let rank = slotRank(d, dz, r);
				for (let s of Object.keys(days[d].dzones[dz].rounds[r].slots)) {
					let match = days[d].dzones[dz].rounds[r].slots[s].match;
					if (!isBaseballGroupMatch(match)) continue;
					[match.team_home.name, match.team_away.name].forEach(name => {
						if (!(name in ranks) || rank < ranks[name]) ranks[name] = rank;
					});
				}
			}
		}
	}
	return ranks;
}

function isBaseballIntroMatch(ranks, m, d, dz, r) {
	if (!isBaseballGroupMatch(m)) return false;
	let rank = slotRank(d, dz, r);
	let known = name => name in ranks && ranks[name] < rank;
	return !known(m.team_home.name) || !known(m.team_away.name);
}

//a team still without a baseball match keeps the reservation of the baseball court
function hasBaseballIntroLeft(ranks, matches) {
	return matches.some(m => isBaseballGroupMatch(m)
		&& (!(m.team_home.name in ranks) || !(m.team_away.name in ranks)));
}

/**
 * the rules that read the round beside the one a match is being put in: the
 * same pair meeting again, a team playing the same sport again, the same sport
 * on the same field again, and the baseball field kept clear around a match
 * that brings a team to the sport. the round before and the round after are
 * read exactly alike, so they are read here once.
 *
 * the first three are held back by relax_adjacency; the baseball one is not.
 *
 * @param {day[]} days
 * @param {number} d - the day
 * @param {number} dz - the zone of the day
 * @param {number} r - the round the match would go in
 * @param {number} adj - the round beside it, before or after
 * @param {slot} slot - the slot the match would go in
 * @param {match} m - the match being placed
 * @param {string} team1 - its two sides, by name
 * @param {string} team2
 * @param {object} bbRanks - where each team first meets baseball
 * @returns {boolean} - true when the round beside forbids the placement
 */
function adjacentRoundForbids(days, d, dz, r, adj, slot, m, team1, team2, bbRanks) {
	for (let sl of Object.keys(crts)) {
		const beside = days[d].dzones[dz].rounds[adj].slots[sl];
		if (beside.match === null)
			continue;
		const home = beside.match.team_home.name;
		const away = beside.match.team_away.name;
		//a side of a knockout carries no name until it is known, and the second of
		//these has always asked whether the name is the word and not whether there
		//is one, so a match that has no names passes it
		if (!relax_adjacency && typeof home !== 'undefined' && away !== 'undefined') {
			if ((team1 === home || team2 === home) && (team1 === away || team2 === away))
				return true; //the same pair again, whatever the sport
			if (team1 === home || team2 === home || team1 === away || team2 === away) {
				//a team of this match again in the same sport. the same field in the
				//same sport was told apart from it once, but both forbid it alike.
				if (m.sport.name === beside.match.sport.name)
					return true;
			}
		}
		//the diamond is laid out on the football pitch, so the field is left free in
		//the round after a match that brings a team to the sport — nothing is asked
		//of the round before it, and nothing at all of the matches that follow the
		//team's first
		if (adj < r && isBaseballIntroMatch(bbRanks, beside.match, d, dz, adj)
			&& beside.court === slot.court)
			return true;
	}
	return false;
}

function involvesFirstTeam(m) {
	if (!config.teams || config.teams.length === 0) return false;
	let firstTeam = config.teams[0];
	if (m.team_home && m.team_home.name !== undefined) {
		if (m.team_home.name === firstTeam.name || m.team_home.id === firstTeam.id) return true;
		if (m.team_away.name === firstTeam.name || m.team_away.id === firstTeam.id) return true;
	}
	if (m.team_home && m.team_home.type === 'fixed') {
		if (m.team_home.team.name === firstTeam.name || m.team_home.team.id === firstTeam.id) return true;
	}
	if (m.team_away && m.team_away.type === 'fixed') {
		if (m.team_away.team.name === firstTeam.name || m.team_away.team.id === firstTeam.id) return true;
	}
	return false;
}

function getTeamsPlayedInZone(dzone) {
	let played = new Set();
	for (let r = 0; r < dzone.rounds.length; r++) {
		for (let s of Object.keys(dzone.rounds[r].slots)) {
			let m = dzone.rounds[r].slots[s].match;
			if (m) {
				if (m.team_home && m.team_home.name !== undefined) played.add(m.team_home.name);
				if (m.team_away && m.team_away.name !== undefined) played.add(m.team_away.name);
				if (m.team_home && m.team_home.type === 'fixed') played.add(m.team_home.team.name);
				if (m.team_away && m.team_away.type === 'fixed') played.add(m.team_away.team.name);
			}
		}
	}
	return played;
}

function isZoneFullyScheduled(dzone) {
	for (let r = 0; r < dzone.rounds.length; r++) {
		for (let s of Object.keys(dzone.rounds[r].slots)) {
			if (dzone.rounds[r].slots[s].match === null) {
				return false;
			}
		}
	}
	return true;
}

function checkZoneTeamCoverage(dzone) {
	if (dzone.rounds.length < 2) return true;
	let groupMatchesCount = 0;
	for (let r = 0; r < dzone.rounds.length; r++) {
		for (let s of Object.keys(dzone.rounds[r].slots)) {
			let m = dzone.rounds[r].slots[s].match;
			if (m && typeof m.team_home.name !== 'undefined' && typeof m.team_away.name !== 'undefined') {
				groupMatchesCount++;
			}
		}
	}
	if (groupMatchesCount >= 5) {
		let played = getTeamsPlayedInZone(dzone);
		return played.size >= config.teams.length;
	}
	return true;
}

//a group has phases when every team plays against every other team more than once,
//so its matches must be placed phase by phase. groups with explicitly given matches
//have a single phase, thus no ordering between their matches.
function hasGroupPhases(group_id) {
	let group = config.groups[group_id];
	if (!group || group.matches) return false;
	let phases = group.team_matches / (group.teams.length - 1);
	return group.team_matches % (group.teams.length - 1) === 0 && phases !== 1;
}

//a knockout match may take one opponent from a group ranking and the other from another
//knockout (a barrage feeding a semifinal). it must wait for the knockout it depends on,
//so it belongs to the knockout stage and not to the group stage.
function isKnockoutFed(m) {
	return (m.team_home && m.team_home.type === 'knockout') || (m.team_away && m.team_away.type === 'knockout');
}

//the ids of the knockouts whose result this match waits for
function feederKnockoutIds(m) {
	let ids = [];
	if (m.team_home && m.team_home.type === 'knockout') ids.push(m.team_home.knockout.id);
	if (m.team_away && m.team_away.type === 'knockout') ids.push(m.team_away.knockout.id);
	return ids;
}

function hasPairPlayedInZone(dzone, team1Name, team2Name) {
	if (!team1Name || !team2Name) return false;
	for (let r = 0; r < dzone.rounds.length; r++) {
		for (let s of Object.keys(dzone.rounds[r].slots)) {
			let m = dzone.rounds[r].slots[s].match;
			if (m) {
				let hName = m.team_home ? (m.team_home.name || (m.team_home.team ? m.team_home.team.name : undefined)) : undefined;
				let aName = m.team_away ? (m.team_away.name || (m.team_away.team ? m.team_away.team.name : undefined)) : undefined;
				if (hName && aName) {
					if ((hName === team1Name || hName === team2Name) && (aName === team1Name || aName === team2Name)) {
						return true;
					}
				}
			}
		}
	}
	return false;
}

//Here is the scheduling for default structure. It is a recursive function that every time a match is placed in a slot, it calls itself after it pops the match, to schedule the next one until all matches are placed in a slot.
// Group teams and fixed knockout entrants occupy the round equally, regardless
// of which match was placed first. Unresolved qualifiers remain unknown here.
function schedule_known_clash(match, round) {
	const known = game => [game.team_home, game.team_away]
		.map(side => side.type === 'fixed' ? side.team.id : side.id)
		.filter(id => id !== undefined);
	const teams = known(match);
	return Object.values(round.slots).some(slot => slot.match &&
		known(slot.match).some(id => teams.includes(id)));
}

function ScheduleMatchesDefault(matches,days){
	if (globalThis.startTime && Date.now() - globalThis.startTime > 3000) {
		throw new Error("TIMEOUT");
	}
	//nothing below reads these; they only remember how far the search has got
	if (matches.length < schedule_best_left) {
		schedule_best_left = matches.length;
		schedule_best_unplaced = matches.slice();
	}
	for (let pd = 0; pd < days.length; pd++) {
		for (let pdz = 0; pdz < days[pd].dzones.length; pdz++) {
			if (isZoneFullyScheduled(days[pd].dzones[pdz])) {
				if (!checkZoneTeamCoverage(days[pd].dzones[pdz])) {
					return false;
				}
			}
		}
	}
	let arr=[];
	round_counting=0;
	if (matches.length === 0){
		return days;
	}
	else{
		
		matches.sort((a, b) => b.points - a.points);
		crts = Object.fromEntries(
			Object.entries(crts).sort(([, a], [, b]) => b - a)
		);
		//the baseball rules only concern the matches that introduce the sport to a team
		let bbRanks = baseballFirstRanks(days);
		let bbIntroLeft = hasBaseballIntroLeft(bbRanks, matches);
		console.log(matches.length);
		//debugger;
		//console.log(days)
		for (let d = 0; d < days.length; d++){//for every day
			for (let dz = 0; dz< days[d].dzones.length; dz++){//for every zone of the day
				for (let r = 0; r < days[d].dzones[dz].rounds.length; r++){//for every round of that zone of that day
					let courtsToIterate = Object.keys(crts);
					if (r === 0) {
						if (bbIntroLeft && days[d].dzones[dz].rounds.length >= 2 && !hasBaseballGroupMatchInZone(days[d].dzones[dz])) {
							let bbSport = config.sports.find(sp => sp.name === BASEBALL_SPORT);
							if (bbSport) {
								courtsToIterate.sort((a, b) => {
									let aIsBB = bbSport.courts.includes(a);
									let bIsBB = bbSport.courts.includes(b);
									if (aIsBB && !bIsBB) return -1;
									if (!aIsBB && bIsBB) return 1;
									return 0;
								});
							}
						}
					}
					for (let s of courtsToIterate){//for every slot (name of court sorted by need) in this round
						for (let m = 0; m < matches.length; m++){
							if (schedule_known_clash(matches[m], days[d].dzones[dz].rounds[r])) continue;
							//RULES
							//if this slot is available and the court corresponds to the sport of the match and its not a knockout (1)
							//console.log(d,days[d].dzones[dz].rounds[r].slots[s],matches[m].id,matches[m].team_home.name,matches[m].team_away.name,matches[m].points,matches[m].sequence,days[d].date,days[d].dzones[dz].rounds[r].rank,days[d].dzones[dz].rounds[r].zone);
							
							if (days[d].dzones[dz].rounds[r].slots[s].match === null && matches[m].sport.courts.includes(days[d].dzones[dz].rounds[r].slots[s].court) && typeof (matches[m].team_home.name) !== 'undefined' && typeof (matches[m].team_away.name) !== 'undefined'){
								//console.log(matches[m].id,matches[m].team_home.name,matches[m].team_away.name,matches[m].points,matches[m].sequence,'GROUP GAME')
								let team1 = matches[m].team_home.name;
								let team2 = matches[m].team_away.name;
								let scheduled = false;

								if (d === 0 && dz === 0 && involvesFirstTeam(matches[m])) {
									scheduled = true;
								}

								if (hasPairPlayedInZone(days[d].dzones[dz], team1, team2)) {
									scheduled = true;
								}
								
								let used_slots=0;
								for (let sl=0; sl < Object.keys(days[d].dzones[dz].rounds[r].slots).length; sl++){
									if (Object.values(days[d].dzones[dz].rounds[r].slots)[sl].match !== null){
										used_slots+=1;
									}
								}
								
								//If in this specific date, in a specific zone and rank a team is scheduled to play something else (2)
								for (let sl=0; sl < Object.keys(days[d].dzones[dz].rounds[r].slots).length; sl++){//for every slot in this round
									if (Object.values(days[d].dzones[dz].rounds[r].slots)[sl].match !== null){//if this slot has an active match

											if (Object.values(days[d].dzones[dz].rounds[r].slots)[sl].match.team_home.name === team1 || Object.values(days[d].dzones[dz].rounds[r].slots)[sl].match.team_away.name === team1 || Object.values(days[d].dzones[dz].rounds[r].slots)[sl].match.team_home.name === team2 || Object.values(days[d].dzones[dz].rounds[r].slots)[sl].match.team_away.name === team2){
												scheduled = true;
												break;
											}
											if (used_slots * 2 >= config.teams.length - 1){ //only 1 or 0 teams available = cannot produce a match in that round
												scheduled = true;
												break;
											}
									}
								}
								if (days[d].dzones[dz].rounds.length < 2 && isBaseballIntroMatch(bbRanks, matches[m], d, dz, r)) {
									scheduled = true;
								}
								let too_late=false;
								let too_early=false;

								let gr_id = matches[m].id;
								for (let ma=0; ma<matches.length; ma++){
									if (matches[ma].id === gr_id){
										if (hasGroupPhases(gr_id)){
											if (matches[m].sequence>matches[ma].sequence){
												too_early = true;//if there is at least a not placed match of previous phase
												break;
											}
										}
									}	
								}

								if (isBaseballGroupMatch(matches[m])) {
									// the zone by zone spreading of the baseball group stage only
									// holds for a match that brings a team to the sport for the
									// first time. once both teams have played it, the match is
									// placed like any other.
									if (isBaseballIntroMatch(bbRanks, matches[m], d, dz, r)) {
										if (r !== 0) {
											scheduled = true;
										}
										if (hasBaseballGroupMatchInZone(days[d].dzones[dz])) {
											scheduled = true;
										}
										if (days[d].dzones[dz].rounds.length < 2) {
											scheduled = true;
										}
										for (let pd = 0; pd <= d; pd++) {
											let maxPdz = (pd === d) ? dz - 1 : days[pd].dzones.length - 1;
											for (let pdz = 0; pdz <= maxPdz; pdz++) {
												if (days[pd].dzones[pdz].rounds.length >= 2 && !hasBaseballGroupMatchInZone(days[pd].dzones[pdz])) {
													too_early = true;
													break;
												}
											}
											if (too_early) break;
										}
									}
								} else {
									if (r === 0) {
										if (bbIntroLeft && days[d].dzones[dz].rounds.length >= 2 && !hasBaseballGroupMatchInZone(days[d].dzones[dz])) {
											let bbSport = config.sports.find(sp => sp.name === BASEBALL_SPORT);
											if (bbSport && bbSport.courts.includes(days[d].dzones[dz].rounds[r].slots[s].court)) {
												scheduled = true;
											}
										}
									}
								}

								for (let rd = d; rd < days.length; rd++){//for every day
									let start_dz = (rd === d) ? dz : 0;
									for (let rdz = start_dz; rdz < days[rd].dzones.length; rdz++){//for every zone of the day
										let start_r = (rd === d && rdz === dz) ? r : 0;
										for (let rr = start_r; rr < days[rd].dzones[rdz].rounds.length; rr++){//for every round of that zone of that day
											for (let sdate of Object.keys(days[rd].dzones[rdz].rounds[rr].slots)){
												if (days[rd].dzones[rdz].rounds[rr].slots[sdate].match !== null){
													if (typeof (days[rd].dzones[rdz].rounds[rr].slots[sdate].match.team_home.name) !== 'undefined' && typeof (days[rd].dzones[rdz].rounds[rr].slots[sdate].match.team_away.name) !== 'undefined'){
														if (days[rd].dzones[rdz].rounds[rr].slots[sdate].match.id === gr_id){
															if (hasGroupPhases(gr_id)){
																if (matches[m].sequence>days[rd].dzones[rdz].rounds[rr].slots[sdate].match.sequence){
																	too_early = true;//if all first phase matches of a group are placed but we are trying to place a 2nd phase game before all 1st phase games are finished
																	//console.log('προσπάθησα να βάλω το ματσ :',matches[m],'την μέρα',days[d],'αλλά υπάρχει το ματσ:',days[rd].dzones[rdz].rounds[rr].slots[sdate].match);
																	break;
																}
															}
														}
													}	
												}
											}
											if(too_early){
												break;
											}
										}
										if(too_early){
											break;
										}
									}
									if(too_early){
										break;
									}
								}


								
								
								
								//rules for sorting the matches
								//console.log('s',scheduled,'tl' ,too_late,'te',too_early,'GROUP GAME');
								if (!scheduled && !too_late && !too_early){
									for (let ma=0; ma<matches.length; ma++){//maybe this will be deleted
										if (matches[m].points<0){
											//matches[ma].points=0;
										}		
									}
									let prev_round=r-1
									let next_round=r+1
									const here = days[d].dzones[dz].rounds[r].slots[s];
									if (prev_round >= 0 && r !== 0 && adjacentRoundForbids(days, d, dz, r, prev_round, here, matches[m], team1, team2, bbRanks))
										scheduled = true;
									if (next_round < days[d].dzones[dz].rounds.length && adjacentRoundForbids(days, d, dz, r, next_round, here, matches[m], team1, team2, bbRanks))
										scheduled = true;
									for (let dz_whole = 0; dz_whole< days[d].dzones.length; dz_whole++){//for the whole day
										for (let r_whole = 0; r_whole < days[d].dzones[dz_whole].rounds.length; r_whole++){
											for (let sl of Object.keys(crts)){
												if (days[d].dzones[dz_whole].rounds[r_whole].slots[sl].match !== null){
													if (typeof days[d].dzones[dz_whole].rounds[r_whole].slots[sl].match.team_home.name !== 'undefined' && days[d].dzones[dz_whole].rounds[r_whole].slots[sl].match.team_away.name !== 'undefined'){
														if ((team1 === days[d].dzones[dz_whole].rounds[r_whole].slots[sl].match.team_home.name || team2 === days[d].dzones[dz_whole].rounds[r_whole].slots[sl].match.team_home.name) && (team1 === days[d].dzones[dz_whole].rounds[r_whole].slots[sl].match.team_away.name || team2 === days[d].dzones[dz_whole].rounds[r_whole].slots[sl].match.team_away.name)){
																
															if (matches[m].sport.name === days[d].dzones[dz_whole].rounds[r_whole].slots[sl].match.sport.name){
																scheduled=true;
																//matches[m].points-=14;//we do not want the same pair of teams to play the same sport again all day.
																//console.log('points-14 because same pair same sport same day');
																
															}
														}
													}
												}
}
										}
									}
								}

								//console.log('Points right now: ',matches[m].points);
								let threshold=0;
								if (matches[m].points >= threshold && !scheduled && !too_late && !too_early){
									for (let ma=0; ma<matches.length; ma++){//above points optimized for input23g
										if (typeof matches[ma].team_home.name !== 'undefined' && matches[ma].team_away.name !== 'undefined'){
											let homePlayed = (matches[ma].team_home.name === team1 || matches[ma].team_home.name === team2);
											let awayPlayed = (matches[ma].team_away.name === team1 || matches[ma].team_away.name === team2);
											if (!homePlayed && !awayPlayed){
												matches[ma].points += 15.0; // both teams idle in this round -> high priority for next slots
											} else if (homePlayed || awayPlayed){
												matches[ma].points -= 10.0; // played in this round -> low priority for next slots
											}
										}
									}
									//prototype rules for sorting the courts. TODOS: 1. some courts in the same sport are more valuable, 2. some courts do not have many matches in them making them less valuable.
									for (let c of Object.keys(crts)){
										if (!matches[m].sport.courts.includes(c)){
											crts[c]+=1;//all sports must be played simultaneously, so the sports that did not used in this round are more valuable for next round.
											if (c.includes(FOOTBALL_SPORT)){
												crts[c]+=50 //TODO this must be lower and for the courts that will host the more matches, now it is for testing purposes.
											}
										}
									}

									
									
									//the match is put in the slot and taken back out if it leads
									//nowhere, instead of the whole calendar being copied for it
									days[d].dzones[dz].rounds[r].slots[s].match=matches[m];
									let newMatches = matches.filter((element) => element !== matches[m]);
									//console.log('Match: ',matches[m],' placed.',matches,crts);


									result=ScheduleMatchesDefault(newMatches,days);

									if (result){
										return result;
									}
									days[d].dzones[dz].rounds[r].slots[s].match=null;
										
								}
								else if (matches[m].points < threshold){
									matches[m].points=0;
									//console.log('reset points');
								}
							}
							else if (days[d].dzones[dz].rounds[r].slots[s].match === null && matches[m].sport.courts.includes(days[d].dzones[dz].rounds[r].slots[s].court) && typeof (matches[m].team_home.name) === 'undefined' && typeof (matches[m].team_away.name) === 'undefined'){
								//console.log(matches[m].id,matches[m].team_home.name,matches[m].team_away.name,matches[m].points,matches[m].sequence,'KN GAME')
								let scheduled_k = false;
								if (!isKnockoutFed(matches[m]) && (matches[m].team_home.type === 'group' || matches[m].team_away.type === 'group')){
									let group_finished = true;
									
									for (let mg=0; mg<matches.length; mg++){
										if (typeof (matches[mg].team_home.name) !== 'undefined' && typeof (matches[mg].team_away.name) !== 'undefined' && matches[mg].sport.name === matches[m].sport.name){//if one of the groups (same sport) is not finished yet
											group_finished = false;
											break;
										}
									}
									//console.log('gf',group_finished);
									if (group_finished){
										let too_early = false;
										let too_late = false;
										for (let ddate = d; ddate < days.length; ddate++){//for every day from d
											let start_dz = (ddate === d) ? dz : 0;
											for (let ddz = start_dz; ddz < days[ddate].dzones.length; ddz++){//for every zone of the day
												let start_r = 0;
												for (let drr = start_r; drr < days[ddate].dzones[ddz].rounds.length; drr++){//for every round of that zone of that day
													for (let sdate of Object.keys(days[ddate].dzones[ddz].rounds[drr].slots)){
														if (days[ddate].dzones[ddz].rounds[drr].slots[sdate].match !== null){
															if (typeof (days[ddate].dzones[ddz].rounds[drr].slots[sdate].match.team_home.name) !== 'undefined' && typeof (days[ddate].dzones[ddz].rounds[drr].slots[sdate].match.team_away.name) !== 'undefined' && days[ddate].dzones[ddz].rounds[drr].slots[sdate].match.sport.name === matches[m].sport.name){
																too_early = true;//if there is a group game from the same sport after the match we want to place that means that we are too early to place it
																break;
															}	
														}
													}
													if(too_early){
														break;
													}
												}
												if(too_early){
													break;
												}
											}
											if(too_early){
												break;
											}
										}
										for (let ddate = d; ddate >= 0; ddate--){//for every previous day from d
											let max_dz = (ddate === d) ? dz + 1 : days[ddate].dzones.length;
											for (let ddz = 0; ddz < max_dz; ddz++){//for every zone of the day
												let max_r = (ddate === d && ddz === dz) ? r : days[ddate].dzones[ddz].rounds.length;
												for (let drr = 0; drr < max_r; drr++){//for every round of that zone of that day
													//console.log(r,max_r,max_dz,dz,ddate,d);
													if (days[ddate].dzones[ddz].rounds[drr]){
														for (let sdate of Object.keys(days[ddate].dzones[ddz].rounds[drr].slots)){
															if (days[ddate].dzones[ddz].rounds[drr].slots[sdate].match !== null){
																if (days[ddate].dzones[ddz].rounds[drr].slots[sdate].match.sport.name === matches[m].sport.name && (days[ddate].dzones[ddz].rounds[drr].slots[sdate].match.team_home.type === 'knockout' || days[ddate].dzones[ddz].rounds[drr].slots[sdate].match.team_away.type === 'knockout')){
																	too_late = true;//this is a group type kn game indicating that is less special than a knockout type kn game, thus it must be placed earlier
																	//console.log(days[ddate].dzones[ddz]);
																	break;
																}	
															}
														}
														if(too_late){
															break;
														}
													}
												}
												if(too_late){
													break;
												}
											}
											if(too_late){
												break;
											}
										}
										if (finalOutOfOrder(days, matches[m], d, dz, r)) {
											too_early = true;
										}
										if (r === 0) {
											if (bbIntroLeft && days[d].dzones[dz].rounds.length >= 2 && !hasBaseballGroupMatchInZone(days[d].dzones[dz])) {
												let bbSport = config.sports.find(sp => sp.name === BASEBALL_SPORT);
												if (bbSport && bbSport.courts.includes(days[d].dzones[dz].rounds[r].slots[s].court)) {
													scheduled_k = true;
												}
											}
										}

										if (d === 0 && dz === 0 && involvesFirstTeam(matches[m])) {
											scheduled_k = true;
										}

										if (!too_early && !too_late){
											let team1_k='not defined';
											let team2_k='not defined';
											if (matches[m].team_home.type === 'fixed'){
												team1_k=matches[m].team_home.team.name;
											}
											if (matches[m].team_away.type === 'fixed'){
												team2_k=matches[m].team_away.team.name;
											}
											
											let used_slots=0;
											for (let sl=0; sl < Object.keys(days[d].dzones[dz].rounds[r].slots).length; sl++){
												if (Object.values(days[d].dzones[dz].rounds[r].slots)[sl].match !== null){
													used_slots+=1;
												}
											}
											for (let sl=0; sl < Object.keys(days[d].dzones[dz].rounds[r].slots).length; sl++){//for every slot in this round
												if (Object.values(days[d].dzones[dz].rounds[r].slots)[sl].match !== null){//if this slot has an active match
													if (Object.values(days[d].dzones[dz].rounds[r].slots)[sl].match.team_home.name === team1_k || Object.values(days[d].dzones[dz].rounds[r].slots)[sl].match.team_away.name === team1_k || Object.values(days[d].dzones[dz].rounds[r].slots)[sl].match.team_home.name === team2_k || Object.values(days[d].dzones[dz].rounds[r].slots)[sl].match.team_away.name === team2_k){
														scheduled_k = true;
														break;
													}
												}
												if (used_slots * 2 >= config.teams.length - 1){ //only 1 or 0 teams available = cannot produce a match in that round
													scheduled_k = true;
													break;
												}

											}
											

											//console.log('sk',scheduled_k,'FOR GROUP KN');
											if (!scheduled_k){
												days[d].dzones[dz].rounds[r].slots[s].match=matches[m];
												let newMatches = matches.filter((element) => element !== matches[m]);
												result=ScheduleMatchesDefault(newMatches,days);

												if (result)
												{
													return result;
												}
												days[d].dzones[dz].rounds[r].slots[s].match=null;
													
											}
										}
									}
								}
								else if (isKnockoutFed(matches[m])){
									
									let knockout_finished = true;
									
									for (let mg=0; mg<matches.length; mg++){
										if (typeof (matches[mg].team_home.name) === 'undefined' && typeof (matches[mg].team_away.name) === 'undefined' ){//if one of this knockout games is not finished yet
											if (feederKnockoutIds(matches[m]).includes(matches[mg].id)){
												knockout_finished = false;
												break;
											}
											if (matches[m].team_home.is_winner === true || matches[m].team_away.is_winner === true){
												if (matches[mg].team_home.is_winner === false || matches[mg].team_away.is_winner === false){
													if (matches[mg].team_home.type === 'knockout' && feederKnockoutIds(matches[m]).includes(matches[mg].team_home.knockout.id)){
														knockout_finished = false;//losers games must be placed before winners games are placed
														break;
													}
												}
											}
										}
										else if (typeof (matches[mg].team_home.name) !== 'undefined' && typeof (matches[mg].team_away.name) !== 'undefined' && matches[mg].sport.name === matches[m].sport.name){//if one of the groups (same sport) is not finished yet
											knockout_finished = false;
											break;
										}
									}
									//console.log('kf', knockout_finished,'FOR KNOCKOUT');
									if (knockout_finished){
										let too_early = false;
										for (let ddate = d; ddate < days.length; ddate++){//for every day from d
											let start_dz = (ddate === d) ? dz : 0;
											for (let ddz = start_dz; ddz < days[ddate].dzones.length; ddz++){//for every zone of the day
												let start_r = 0;
												for (let drr = start_r; drr < days[ddate].dzones[ddz].rounds.length; drr++){//for every round of that zone of that day
													for (let sdate of Object.keys(days[ddate].dzones[ddz].rounds[drr].slots)){
														if (days[ddate].dzones[ddz].rounds[drr].slots[sdate].match !== null && days[ddate].dzones[ddz].rounds[drr].slots[sdate].match.sport.name === matches[m].sport.name && typeof (days[ddate].dzones[ddz].rounds[drr].slots[sdate].match.team_home.name) === 'undefined' && typeof (days[ddate].dzones[ddz].rounds[drr].slots[sdate].match.team_away.name) === 'undefined'){
															if (feederKnockoutIds(matches[m]).includes(days[ddate].dzones[ddz].rounds[drr].slots[sdate].match.id)){
																too_early = true;
																break;
															}
															if (matches[m].team_home.is_winner === true || matches[m].team_away.is_winner === true){
																if ((days[ddate].dzones[ddz].rounds[drr].slots[sdate].match.team_home.is_winner === false && matches[m].team_home.type === 'knockout' && days[ddate].dzones[ddz].rounds[drr].slots[sdate].match.team_home.knockout.id === matches[m].team_home.knockout.id) || (days[ddate].dzones[ddz].rounds[drr].slots[sdate].match.team_away.is_winner === false && matches[m].team_away.type === 'knockout' && days[ddate].dzones[ddz].rounds[drr].slots[sdate].match.team_away.knockout.id === matches[m].team_away.knockout.id)){
																	too_early = true;//losers games if placed already must be earlier than winners games (3rd place game - final)
																	break;
																}
															}
															if (days[ddate].dzones[ddz].rounds[drr].slots[sdate].match.team_home.type === 'group' || days[ddate].dzones[ddz].rounds[drr].slots[sdate].match.team_away.type === 'group'){
																too_early = true;//this is a knockout type kn game indicating that is more special than a group type kn game, thus it must be placed later
																break;
															}
														}
														else if (days[ddate].dzones[ddz].rounds[drr].slots[sdate].match !== null && days[ddate].dzones[ddz].rounds[drr].slots[sdate].match.sport.name === matches[m].sport.name){
															if (typeof (days[ddate].dzones[ddz].rounds[drr].slots[sdate].match.team_home.name) !== 'undefined' && typeof (days[ddate].dzones[ddz].rounds[drr].slots[sdate].match.team_away.name) !== 'undefined'){
																too_early = true;//we want knockouts later than already placed group games
																break;
															}
														}
													}
													if (too_early){
														break;
													}
												}
												if (too_early){
													break;
												}
											}
											if (too_early){
												break;
											}
										}
										if (finalOutOfOrder(days, matches[m], d, dz, r)) {
											too_early = true;
										}
										if (r === 0) {
											if (bbIntroLeft && days[d].dzones[dz].rounds.length >= 2 && !hasBaseballGroupMatchInZone(days[d].dzones[dz])) {
												let bbSport = config.sports.find(sp => sp.name === BASEBALL_SPORT);
												if (bbSport && bbSport.courts.includes(days[d].dzones[dz].rounds[r].slots[s].court)) {
													too_early = true;
												}
											}
										}

										if (d === 0 && dz === 0 && involvesFirstTeam(matches[m])) {
											too_early = true;
										}

										if (!too_early){
											let team1_k='not defined';
											let team2_k='not defined';
											if (matches[m].team_home.type === 'fixed'){
												team1_k=matches[m].team_home.team.name;
											}
											if (matches[m].team_away.type === 'fixed'){
												team2_k=matches[m].team_away.team.name;
											}
										
											let used_slots=0;
											for (let sl=0; sl < Object.keys(days[d].dzones[dz].rounds[r].slots).length; sl++){
												if (Object.values(days[d].dzones[dz].rounds[r].slots)[sl].match !== null){
													used_slots+=1;
												}
											}
											for (let sl=0; sl < Object.keys(days[d].dzones[dz].rounds[r].slots).length; sl++){//for every slot in this round
												if (Object.values(days[d].dzones[dz].rounds[r].slots)[sl].match !== null){//if this slot has an active match
													if (Object.values(days[d].dzones[dz].rounds[r].slots)[sl].match.team_home.name === team1_k || Object.values(days[d].dzones[dz].rounds[r].slots)[sl].match.team_away.name === team1_k || Object.values(days[d].dzones[dz].rounds[r].slots)[sl].match.team_home.name === team2_k || Object.values(days[d].dzones[dz].rounds[r].slots)[sl].match.team_away.name === team2_k){
														scheduled_k = true;
														break;
													}
												}
												if (used_slots * 2 >= config.teams.length - 1){ //only 1 or 0 teams available = cannot produce a match in that round
													scheduled_k = true;
													break;
												}
											}
											//console.log('sk',scheduled_k,'FOR KNOCKOUT');
											if (!scheduled_k){
												days[d].dzones[dz].rounds[r].slots[s].match=matches[m];
												let newMatches = matches.filter((element) => element !== matches[m]);
												result=ScheduleMatchesDefault(newMatches,days);

												if (result)
												{
													return result;
												}
												days[d].dzones[dz].rounds[r].slots[s].match=null;
													
											}
										}
									}
								}
								else if(matches[m].team_home.type === 'fixed' && matches[m].team_away.type === 'fixed'){
									team1_k=matches[m].team_home.team.name;
									team2_k=matches[m].team_away.team.name;
								
									let used_slots=0;
									for (let sl=0; sl < Object.keys(days[d].dzones[dz].rounds[r].slots).length; sl++){
										if (Object.values(days[d].dzones[dz].rounds[r].slots)[sl].match !== null){
											used_slots+=1;
										}
									}
									for (let sl=0; sl < Object.keys(days[d].dzones[dz].rounds[r].slots).length; sl++){//for every slot in this round
										if (Object.values(days[d].dzones[dz].rounds[r].slots)[sl].match !== null){//if this slot has an active match
											if (Object.values(days[d].dzones[dz].rounds[r].slots)[sl].match.team_home.name === team1_k || Object.values(days[d].dzones[dz].rounds[r].slots)[sl].match.team_away.name === team1_k || Object.values(days[d].dzones[dz].rounds[r].slots)[sl].match.team_home.name === team2_k || Object.values(days[d].dzones[dz].rounds[r].slots)[sl].match.team_away.name === team2_k){
												scheduled_k = true;
												break;
											}
										}
										if (used_slots * 2 >= config.teams.length - 1){ //only 1 or 0 teams available = cannot produce a match in that round
											scheduled_k = true;
											break;
										}
									}
									//console.log('sk',scheduled_k,'FOR FIXED');
									if (!scheduled_k){
										days[d].dzones[dz].rounds[r].slots[s].match=matches[m];
										let newMatches = matches.filter((element) => element !== matches[m]);
										result=ScheduleMatchesDefault(newMatches,days);

										if (result)
										{
											return result;
										}
										days[d].dzones[dz].rounds[r].slots[s].match=null;
											
									}
								}
							}
						}
					}
				}
			}
		}
	}
}
