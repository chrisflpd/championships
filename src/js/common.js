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
 * place to say so. the field the diamond is laid out on is not named: it is
 * whichever field the baseball is played on, which the configuration says.
 */
const FOOTBALL_SPORT = 'Ποδόσφαιρο';
const BASEBALL_SPORT = 'Μπέιζμπολ';


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


/**
 * a sport that cannot be drawn: so much for a win and so much for a loss, and a
 * score that is level is a mistake in the entering of it rather than a result.
 *
 * @param {number} win
 * @param {number} loss
 * @param {string} sport - as it is read in the complaint
 * @returns {function}
 */
function win_loss_points_fn(win, loss, sport) {
	return (sh, sa) => {
		if (sh > sa)
			return [win, loss];
		if (sh < sa)
			return [loss, win];
		throw `ισοπαλία στο ${sport};`;
	};
}


/*
 * what each sport scores, taken from the points sheet of the template, which is
 * where these are added up for real:
 *
 *   football     PTS = 3*W + 1*D + 0*L
 *   basketball   PTS = 2*W + 1*L          and no column for a draw
 *   baseball     PTS = 2*W + 1*L          the same
 *   volleyball   PTS = PLD + L + GD       counted in sets
 *
 * a sport may say otherwise in its own line of the configuration.
 */
const points_fn_obj = {
	'Ποδόσφαιρο': wdl_points_fn(3, 1, 0),
	'Μπάσκετ': win_loss_points_fn(2, 1, 'μπάσκετ'),
	'Μπέιζμπολ': win_loss_points_fn(2, 1, 'μπέιζμπολ'),
	//one point for turning up, one more for losing, and the difference of the
	//sets. over two sets that comes to three points against nothing for winning
	//both, and two against one for winning it in three.
	'Βόλεϊ': (sh, sa) => {
		if (sh === sa)
			throw 'ισοπαλία στο βόλεϊ;';
		return [
			1 + (sh < sa ? 1 : 0) + (sh - sa),
			1 + (sa < sh ? 1 : 0) + (sa - sh),
		];
	},
};
