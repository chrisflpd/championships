/**
 * @typedef court
 * @type {string} - trimmed words, unique, non-empty
 */

/**
 * @typedef sport
 * @type {object}
 * @property {string} name - trimmed word, unique, non-empty
 * @property {court[]} courts
 * @property {function} points_fn - what a score is worth to the two sides
 */

/**
 * @typedef zone
 * @type {object}
 * @property {number} rank - integer used for ordering
 * @property {?string} name - trimmed words, unique, non-empty
 */

/**
 * @typedef day
 * @type {object}
 * @property {Date} date - unique
 * @property {dzone[]} dzones
 */

/**
 * @typedef dzone
 * @type {object}
 * @property {day} day
 * @property {zone} zone
 * @property {round[]} rounds
 */

/**
 * @typedef round
 * @type {object}
 * @property {dzone} dzone
 * @property {number} rank - integer used for ordering
 * @property {object.<court, slot>} slots
 */

/**
 * @typedef team
 * @type {object}
 * @property {number} id - positive integer
 * @property {string} name - trimmed words, unique, non-empty
 */

/**
 * @typedef group
 * @type {object}
 * @property {string} id - trimmed word, unique, non-empty
 * @property {sport} sport
 * @property {?int} team_matches - matches per team, null if the matches are given
 * @property {team[]} teams
 * @property {?gmatch[]} matches - if the matches are given instead of the teams
 */

/**
 * @typedef gmatch
 * @type {object}
 * @property {team} team_home
 * @property {team} team_away
 */

/**
 * @typedef knockout
 * @type {object}
 * @property {string} id - trimmed word, unique, non-empty
 * @property {sport} sport - trimmed word, non-empty
 * @property {knunion} home
 * @property {knunion} away
 */

/**
 * @typedef knunion
 * @type {object}
 * @property {string} type
 * @property {?team} team - if type === 'fixed'
 * @property {?group} group - if type === 'group'
 * @property {?int} rank - if type === 'group'
 * @property {?knockout} knockout - if type === 'knockout'
 * @property {?boolean} is_winner - if type === 'knockout'
 */

/**
 * @typedef slot
 * @type {object}
 * @property {round} round
 * @property {court} court
 * @property {?match} match
 */

/**
 * @typedef match
 * @type {object}
 * @property {?slot} slot
 * @property {sport} sport
 * @property {team} team_home
 * @property {team} team_away
 * @property {?number} score_home
 * @property {?number} score_away
 */

/**
 * @typedef config
 * @type {object}
 * @property {court[]} courts
 * @property {sport[]} sports
 * @property {zone[]} zones
 * @property {day[]} days
 * @property {team[]} teams
 * @property {object<string, group>} groups
 * @property {object<string, knockout>} knockouts
 */

/**
 * @constant
 * @type {config}
 */
const config = {};


/*
 * the sports the baseball rules turn on, named here rather than in each of the
 * conditions that ask for them. a camp that calls them something else has one
 * place to say so.
 */
const FOOTBALL_SPORT = 'Ποδόσφαιρο';
const BASEBALL_SPORT = 'Μπέιζμπολ';
const BASEBALL_COURT = 'Π Ποδόσφαιρο'; //the field kept clear around a first baseball match


/**
 * the ordinary way of scoring a sport: so much for a win, so much for a draw
 * and so much for a loss.
 *
 * @param {number} win
 * @param {number} draw
 * @param {number} loss
 * @returns {function} - the points of the two sides, home first
 */
function wdl_points_fn(win, draw, loss) {
	return (sh, sa) => {
		if (sh > sa)
			return [win, loss];
		if (sh < sa)
			return [loss, win];
		return [draw, draw];
	};
}


const points_fn_obj = {
	'Ποδόσφαιρο': (sh, sa) => {
		if (sh > sa)
			return [3, 0];
		else if (sh < sa)
			return [0, 3];
		else
			return [1, 1];
	},
	'Μπάσκετ': (sh, sa) => {
		if (sh > sa)
			return [2, 1];
		else if (sh < sa)
			return [1, 2];
		else
			throw 'ισοπαλία στο μπάσκετ;';
	},
	// TODO these two hand back a difference where every other one hands back the
	// points of the two sides, so they have to be settled before anything reads
	// them. a sport line may say what it scores in the meantime, as in
	// "Βόλεϊ 3-0-1", which is taken over whatever stands here.
	'Βόλεϊ': (sh, sa) => sh - sa,
	'Μπέιζμπολ': (sh, sa) => sh - sa,
};
