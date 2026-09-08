/*
 * the two things the page does for itself: the light or dark it is drawn in,
 * and the folding away of the configuration once there is a program to look at
 * instead. neither of the two touches the program or the way it is found.
 */

const THEME_KEY = 'theme';
const PANEL_KEY = 'panel';

//a browser may keep no storage at all, and the page still has to open
function ui_stored(key) {
	try {
		return appStorage.getItem(key);
	} catch (error) {
		return null;
	}
}

function ui_store(key, value) {
	try {
		appStorage.setItem(key, value);
	} catch (error) {
		console.log(error);
	}
}

//Quick explanations sit under the middle of what they describe. Only when that
//would cross a window edge is the centre shifted far enough to keep them in it.
function ui_tooltip_place(target) {
	target.style.removeProperty('--tooltip-shift');
	const pseudo = window.getComputedStyle(target, '::after');
	const width = parseFloat(pseudo.width);
	if (!Number.isFinite(width) || width <= 0)
		return;
	const at = target.getBoundingClientRect();
	const centre = at.left + at.width / 2;
	const room = document.documentElement.clientWidth || window.innerWidth || 1024;
	const half = width / 2;
	const fitted = Math.max(8 + half, Math.min(centre, room - 8 - half));
	target.style.setProperty('--tooltip-shift', `${fitted - centre}px`);
}

function ui_tooltip_event(event) {
	const target = event.target.closest ? event.target.closest('[data-tooltip]') : null;
	if (target !== null)
		ui_tooltip_place(target);
}

//the theme the page is showing right now, which is the one that was chosen or,
//when none was, the one the system asks for
function ui_theme() {
	const chosen = document.documentElement.getAttribute('data-theme');
	if (chosen === 'dark' || chosen === 'light')
		return chosen;
	return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

//the slider is drawn from the theme showing rather than from the theme chosen,
//so that a page left to the system still opens with the knob on the right side
function ui_mark_theme(button) {
	if (button === null)
		return;
	const dark = ui_theme() === 'dark';
	button.setAttribute('aria-checked', dark ? 'true' : 'false');
	const label = dark ? 'Φωτεινό θέμα' : 'Σκοτεινό θέμα';
	button.setAttribute('aria-label', label);
	button.title = label;
}

function ui_set_theme(theme) {
	document.documentElement.setAttribute('data-theme', theme);
	ui_store(THEME_KEY, theme);
}

//only a fold the user asked for is remembered: one the page did on its own
//would otherwise greet the next visit with a folded configuration and nothing
//in the place of the program it was folded for
function ui_collapse(panel, button, collapsed, remember) {
	panel.classList.toggle('is-collapsed', collapsed);
	button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
	const label = (collapsed ? 'Ανάπτυξη' : 'Σύμπτυξη') + ' διαμόρφωσης';
	button.setAttribute('aria-label', label);
	button.title = label;
	if (remember)
		ui_store(PANEL_KEY, collapsed ? 'collapsed' : 'open');
}

/*
 * submitting the configuration again throws away the program on the page: the
 * search starts over, and the plan the camp has been putting right by hand goes
 * with it. that is a whole morning of work, so it is asked about first.
 *
 * the asking hangs off the button rather than off the submit, because it is the
 * camp being about to lose something that is worth stopping — the page
 * submitting on its own behalf has nothing to lose.
 */

//set while the submit the camp has already said yes to is going through
let ui_asked = false;

function ui_program_drawn() {
	return document.querySelector('#program .day-list') !== null;
}

function ui_confirm_close() {
	const open = document.querySelector('.ui-ask');
	if (open !== null)
		open.remove();
	const veil = document.querySelector('.ui-veil');
	if (veil !== null)
		veil.remove();
}

/**
 * asks before something is thrown away.
 *
 * @param {object} said - {title, body, ok, cancel}
 * @param {function} then - called when the camp says yes
 * @returns {void}
 */
function ui_confirm(said, then) {
	ui_confirm_close();

	const veil = document.createElement('div');
	veil.classList.add('ui-veil');
	document.body.appendChild(veil);

	const box = document.createElement('div');
	box.classList.add('ui-ask');
	box.setAttribute('role', 'alertdialog');
	box.setAttribute('aria-modal', 'true');
	box.setAttribute('aria-labelledby', 'ui-ask-title');

	const title = document.createElement('h2');
	title.classList.add('ui-ask-title');
	title.id = 'ui-ask-title';
	title.textContent = said.title;
	box.appendChild(title);

	said.body.forEach(line => {
		const p = document.createElement('p');
		p.classList.add('ui-ask-body');
		p.textContent = line;
		box.appendChild(p);
	});

	const bar = document.createElement('div');
	bar.classList.add('ui-ask-bar');
	box.appendChild(bar);

	const no = document.createElement('button');
	no.type = 'button';
	no.classList.add('button', 'button-quiet');
	no.textContent = said.cancel;
	no.addEventListener('click', ui_confirm_close);
	bar.appendChild(no);

	const yes = document.createElement('button');
	yes.type = 'button';
	yes.classList.add('button', 'button-danger');
	yes.textContent = said.ok;
	yes.addEventListener('click', () => {
		ui_confirm_close();
		then();
	});
	bar.appendChild(yes);

	document.body.appendChild(box);
	//the safe one is the one under the hand, and under the return key
	no.focus();
	veil.addEventListener('click', ui_confirm_close);
	box.addEventListener('keydown', event => {
		if (event.key === 'Escape')
			ui_confirm_close();
	});
}

document.addEventListener('DOMContentLoaded', () => {
	document.addEventListener('pointerover', ui_tooltip_event);
	document.addEventListener('focusin', ui_tooltip_event);

	const form = document.forms[0];
	if (form !== undefined) {
		//caught on the way down at the document, which is the only place that is
		//certainly reached before the listener the parser puts on the form itself:
		//two listeners on the one element run in the order they were added, whatever
		//phase they asked for
		document.addEventListener('submit', event => {
			if (ui_asked || !ui_program_drawn())
				return;
			event.preventDefault();
			event.stopImmediatePropagation();
			ui_confirm({
				title: 'Θα χαθεί το πρόγραμμα που υπάρχει',
				body: [
					'Μια νέα υποβολή ξεκινά αναζήτηση από την αρχή. Το πρόγραμμα που βλέπετε, μαζί με όσες αλλαγές έχετε κάνει με το χέρι πάνω του, θα αντικατασταθεί από αυτό που θα βρεθεί.',
					'Τα σκορ και οι διαιτητές που έχετε καταχωρίσει κρατιούνται, γιατί ανήκουν στον αγώνα και όχι στη θέση του. Αν θέλετε να κρατήσετε και το ίδιο το πρόγραμμα, πατήστε πρώτα Εξαγωγή για ένα πλήρες αντίγραφο.',
				],
				ok: 'Νέα αναζήτηση',
				cancel: 'Ακύρωση',
			}, () => {
				//the same submit again, this time let through
				ui_asked = true;
				form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
				ui_asked = false;
			});
		}, true);
	}

	const theme_button = document.getElementById('theme');
	if (theme_button !== null) {
		ui_mark_theme(theme_button);
		theme_button.addEventListener('click', () => {
			ui_set_theme(ui_theme() === 'dark' ? 'light' : 'dark');
			ui_mark_theme(theme_button);
		});
		//a page that was never told which theme to use follows the system, so it
		//has to follow it when it changes as well
		if (window.matchMedia) {
			const dark = window.matchMedia('(prefers-color-scheme: dark)');
			const follow = () => ui_mark_theme(theme_button);
			if (dark.addEventListener)
				dark.addEventListener('change', follow);
		}
	}

	const panel = document.querySelector('.panel-config');
	const collapse_button = document.getElementById('collapse');
	if (panel !== null && collapse_button !== null) {
		if (ui_stored(PANEL_KEY) === 'collapsed')
			ui_collapse(panel, collapse_button, true, false);
		collapse_button.addEventListener('click', () => {
			ui_collapse(panel, collapse_button, !panel.classList.contains('is-collapsed'), true);
		});

		//the configuration has been read by the time a program is drawn, so it gives
		//up the room it was taking. the program is watched rather than the drawing
		//of it called back, so that the displayer knows nothing of any of this.
		const program = document.getElementById('program');
		if (program !== null && typeof MutationObserver !== 'undefined') {
			new MutationObserver(() => {
				if (program.querySelector('.day-list') !== null)
					ui_collapse(panel, collapse_button, true, false);
			}).observe(program, { childList: true });
		}
	}
});
