/*
 * the championship a previous visit left
 *
 * the plan and the scores are kept in the browser against the configuration they
 * were made for, and the configuration itself is kept beside them. so a camp
 * that opens the page on the second morning already has the whole of the first
 * one sitting in it, and nothing to do but say so: submitting would start a
 * search, and a search would find another program and throw this one away.
 *
 * it is offered where the configuration is, since that is where the camp is
 * looking, and it is only offered when what is stored really is the championship
 * of the configuration in the box — the signature of the one is read against the
 * other before a word is said.
 */

function saved_close() {
	const open = document.querySelector('.saved-offer');
	if (open !== null)
		open.remove();
}

/**
 * what is stored, once it is known to belong to the configuration in the box.
 *
 * @returns {?object} - the stored workbook, or null when there is nothing to offer
 */
function saved_stored() {
	const stored = wb_stored();
	if (stored === null || !stored.plan || Object.keys(stored.plan).length === 0)
		return null;
	const form = document.forms[0];
	if (form === undefined || !form['config'] || form['config'].value.length === 0)
		return null;
	try {
		//the page's own reader, so a configuration it would refuse is refused here
		parse_config(form['config'].value);
	} catch (error) {
		return null;
	}
	//a plan only ever goes back on the configuration it was made for
	return wb_signature() === stored.sig ? stored : null;
}

/**
 * puts the stored championship back without a search: the days of the
 * configuration are the calendar, and the plan that was stored is laid over it.
 *
 * @returns {boolean} - whether it went back
 */
function saved_restore() {
	//no match is placed in these days, so the workbook is built empty and the
	//stored plan is what fills it
	displayer(config.days);
	if (!wb_restore())
		return false;
	sheets_draw();
	return true;
}

/**
 * how much there is, so that what is offered is a championship and not a word.
 *
 * @param {object} stored
 * @returns {string}
 */
function saved_size(stored) {
	const matches = Object.keys(stored.plan).length;
	const scores = Object.values(stored.results || {})
		.filter(one => typeof one.sh === 'number' && typeof one.sa === 'number').length;
	const said = matches === 1 ? '1 αγώνα' : `${matches} αγώνες`;
	if (scores === 0)
		return `${said}, χωρίς σκορ ακόμη`;
	return `${said} και ${scores === 1 ? '1 σκορ' : `${scores} σκορ`}`;
}

/**
 * the line offering it, at the top of the configuration.
 *
 * @param {object} stored
 * @returns {void}
 */
function saved_ask(stored) {
	//over the head of the configuration and not inside it: the configuration folds
	//away, and it is folded on exactly the visit this is for — the one that opens
	//with a championship already made. an offer that folds with it is no offer.
	const panel = document.querySelector('.panel-config');
	if (panel === null)
		return;
	saved_close();

	const bar = document.createElement('div');
	bar.classList.add('sheet-offer', 'saved-offer');
	bar.setAttribute('role', 'status');

	const said = document.createElement('span');
	said.textContent = `Υπάρχει αποθηκευμένο πρωτάθλημα από προηγούμενη επίσκεψη — ${saved_size(stored)}, όπως τα αφήσατε.`;
	bar.appendChild(said);

	const take = document.createElement('button');
	take.type = 'button';
	take.classList.add('button', 'button-primary');
	take.textContent = 'Άνοιγμα';
	take.addEventListener('click', () => {
		saved_close();
		if (saved_restore())
			search_report('Το αποθηκευμένο πρωτάθλημα επαναφέρθηκε. Για νέο πρόγραμμα, υποβάλετε τη διαμόρφωση.', true, 'ok');
	});
	bar.appendChild(take);

	//nothing is thrown away by saying no: the next visit is asked again, and a
	//submit is what replaces it
	const drop = document.createElement('button');
	drop.type = 'button';
	drop.classList.add('button', 'button-quiet');
	drop.textContent = 'Αγνόηση';
	drop.addEventListener('click', saved_close);
	bar.appendChild(drop);

	panel.insertBefore(bar, panel.firstChild);
}

document.addEventListener('DOMContentLoaded', () => {
	//a championship that arrived by link has the page already, and offering the
	//stored one over the top of it would be offering to throw it away
	if (typeof share_carried === 'function' && share_carried() !== null)
		return;
	//after the parser, which is what puts the stored configuration in the box
	const stored = saved_stored();
	if (stored !== null)
		saved_ask(stored);
});
