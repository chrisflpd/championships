/*
 * handing the championship to somebody else
 *
 * the page has no server behind it — it is files on a static host — so there is
 * nowhere to put a championship for another browser to read. what there is, is
 * the address bar: the whole thing goes into the link itself, and whoever opens
 * the link has it.
 *
 * that makes a copy and not a window. what the link carries is the championship
 * as it stood when the link was made; changes made afterwards are in the maker's
 * browser and nowhere else, and a fresh link has to be handed over for them. a
 * link that keeps up with the changes needs somewhere for the changes to be
 * kept, which is a server, which this is not.
 *
 * the configuration is carried as it was written, and the plan as a list of
 * places rather than of names: the calendar and its fields follow from the
 * configuration, so a slot is a number in the one order both sides count in.
 * that is what keeps the link short enough to send.
 */

const SHARE_MARK = '#p=';

//every slot of the calendar, in the one order the two sides count in. it follows
//from the configuration alone, so both of them build the same list.
function share_slots() {
	const out = [];
	workbook.calendar.forEach(day => day.dzones.forEach(dzone => dzone.rounds.forEach(round => {
		config.courts.forEach(court => {
			out.push(wb_key(day.iso, dzone.zone.rank, round.rank, court));
		});
	})));
	return out;
}

/**
 * the championship as it stands, small enough to put in a link.
 *
 * @param {string} text - the configuration as it was written
 * @returns {object}
 */
function share_data(text) {
	const at = {};
	share_slots().forEach((key, i) => {
		at[key] = i;
	});
	const plan = [];
	for (const key in workbook.slots) {
		if (at[key] === undefined)
			continue;
		const game = workbook.slots[key];
		plan.push([at[key], game.id, game.home, game.away, game.occ || 0]);
	}
	plan.sort((one, other) => one[0] - other[0]);
	return { v: 1, c: text, p: plan, r: workbook.results };
}

//base64 the way a link takes it, without the characters a link would eat
function share_encode(text) {
	const bytes = new TextEncoder().encode(text);
	let binary = '';
	bytes.forEach(byte => {
		binary += String.fromCharCode(byte);
	});
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function share_decode(code) {
	const binary = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++)
		bytes[i] = binary.charCodeAt(i);
	return new TextDecoder().decode(bytes);
}

/**
 * the link itself.
 *
 * @param {string} text - the configuration as it was written
 * @returns {Promise<string>}
 */
async function share_link(text) {
	const where = window.location;
	// Repeated group names become small dictionary indexes; slots become deltas.
	// Use the configuration of the actual plan, not an unsubmitted textarea edit.
	const data = share_data(workbook.configuration || text);
	const ids = [...Object.keys(config.groups), ...Object.keys(config.knockouts)];
	let previous = 0;
	const plan = data.p.flatMap(one => {
		const delta = one[0] - previous;
		previous = one[0];
		return [delta, ids.indexOf(one[1]), one[2] || 0, one[3] || 0, one[4]];
	});
	const zip = new JSZip();
	zip.file('p', JSON.stringify({ v: 2, c: data.c, p: plan, r: data.r }), { date: new Date('2000-01-01T00:00:00Z') });
	const code = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE', compressionOptions: { level: 9 } });
	return where.origin + where.pathname + SHARE_MARK + '2.' + code.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * the championship a link is carrying, put on the page. it is not written to
 * the browser's own store: looking at somebody else's championship leaves your
 * own where it was, and only a change of your own puts this one in its place.
 *
 * @param {object} data
 * @returns {boolean}
 */
function share_open(data) {
	if (!data || typeof data.c !== 'string')
		return false;
	// Validate before replacing any visible or saved championship.
	const saved = championship_validate(data.c, null, data);
	parse_config(data.c);
	const form = document.forms[0];
	if (form !== undefined && form['config'])
		form['config'].value = data.c;

	displayer(config.days);

	workbook.offered = saved.plan;
	workbook.results = saved.results;
	if (!wb_restore())
		return false;
	sheets_draw();
	return true;
}

//what is in the address bar, if it is one of ours
async function share_carried() {
	const hash = window.location.hash || '';
	if (hash.indexOf(SHARE_MARK) !== 0)
		return null;
	try {
		const code = hash.slice(SHARE_MARK.length);
		if (!code.startsWith('2.')) return JSON.parse(share_decode(code));
		if (code.length > 200000) throw new Error('Ο σύνδεσμος είναι υπερβολικά μεγάλος.');
		const zip = await JSZip.loadAsync(code.slice(2).replace(/-/g, '+').replace(/_/g, '/'), { base64: true });
		const file = zip.file('p');
		if (!file) throw new Error('Δεν υπάρχει πρωτάθλημα στον σύνδεσμο.');
		let size = 0;
		const text = await new Promise((resolve, reject) => {
			let text = '';
			const stream = file.internalStream('string');
			stream.on('data', chunk => {
				size += chunk.length;
				if (size > 2000000) { stream.pause(); reject(new Error('Το πρωτάθλημα είναι υπερβολικά μεγάλο.')); }
				else text += chunk;
			}).on('error', reject).on('end', () => resolve(text)).resume();
		});
		return JSON.parse(text);
	} catch (error) {
		throw new Error('Ο σύνδεσμος πρωταθλήματος δεν είναι έγκυρος.');
	}
}


/* ------------------------------------------------------------------ the page */

function share_close() {
	const open = document.querySelector('.share-line');
	if (open !== null)
		open.remove();
}

/**
 * the link, laid out to be copied. it is put on the clipboard as well, since
 * that is what anybody wants of it, but it is shown either way: a browser that
 * refuses the clipboard would otherwise say nothing at all.
 *
 * @param {string} link
 * @returns {void}
 */
function share_show(link) {
	share_close();
	const toolbar = document.querySelector('.panel-config .toolbar');
	if (toolbar === null)
		return;

	const line = document.createElement('div');
	line.classList.add('share-line');
	line.setAttribute('role', 'status');

	const said = document.createElement('span');
	said.classList.add('share-said');
	said.textContent = 'Ο σύνδεσμος αντιγράφηκε. Όποιος τον ανοίξει βλέπει το πρωτάθλημα όπως είναι τώρα.';
	line.appendChild(said);

	const box = document.createElement('input');
	box.type = 'text';
	box.readOnly = true;
	box.classList.add('share-link');
	box.value = link;
	box.setAttribute('aria-label', 'Σύνδεσμος κοινής χρήσης');
	box.addEventListener('focus', () => box.select());
	line.appendChild(box);

	const away = document.createElement('button');
	away.type = 'button';
	away.classList.add('button', 'button-quiet');
	away.textContent = 'Κλείσιμο';
	away.addEventListener('click', share_close);
	line.appendChild(away);

	toolbar.parentNode.insertBefore(line, toolbar.nextSibling);
	box.focus();

	try {
		if (navigator.clipboard && navigator.clipboard.writeText)
			navigator.clipboard.writeText(link).catch(() => {
				said.textContent = 'Αντιγράψτε τον σύνδεσμο. Όποιος τον ανοίξει βλέπει το πρωτάθλημα όπως είναι τώρα.';
			});
		else
			said.textContent = 'Αντιγράψτε τον σύνδεσμο. Όποιος τον ανοίξει βλέπει το πρωτάθλημα όπως είναι τώρα.';
	} catch (error) {
		console.log(error);
	}
}

document.addEventListener('DOMContentLoaded', async () => {

	const button = document.getElementById('share');
	const form = document.forms[0];
	if (button !== null && form !== undefined) {
		button.addEventListener('click', async () => {
			button.disabled = true;
			try { share_show(await share_link(form['config'].value)); }
			catch (error) { search_report('Δεν ήταν δυνατή η δημιουργία συνδέσμου.', true, 'error'); }
			finally { button.disabled = false; }
		});
		//there is nothing to hand over until there is a program to hand over
		const program = document.getElementById('program');
		if (program !== null && typeof MutationObserver !== 'undefined') {
			new MutationObserver(() => {
				button.disabled = program.querySelector('.day-list') === null;
			}).observe(program, { childList: true, subtree: true });
		}
	}

	//a link that is carrying one takes the page, and nothing else is offered
	try {
		const carried = await share_carried();
		if (carried !== null && share_open(carried)) {
			if (button !== null)
				button.disabled = false;
			search_report('Αυτό το πρωτάθλημα ανοίχτηκε από σύνδεσμο, όπως ήταν τη στιγμή που δόθηκε.', true, 'ok');
		}
	} catch (error) {
		search_report(error.message, true, 'error');
		const stored = saved_stored();
		if (stored !== null) saved_ask(stored);
	}
});
