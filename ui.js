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
		return localStorage.getItem(key);
	} catch (error) {
		return null;
	}
}

function ui_store(key, value) {
	try {
		localStorage.setItem(key, value);
	} catch (error) {
		console.log(error);
	}
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

document.addEventListener('DOMContentLoaded', () => {

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
