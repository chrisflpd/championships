// GitHub Pages projects share an origin. Keep each deployment's data separate,
// treating /project/ and /project/index.html as the same application.
const STORAGE_PREFIX = 'championships:' + (window.location?.pathname || '/').replace(/[^/]*$/, '') + ':';
const storage_unsaved = new Set();
function storage_notice() {
	const notice = document.getElementById('save-warning');
	if (notice) notice.hidden = storage_unsaved.size === 0;
}
function storage_write(key, action) {
	try {
		action();
		storage_unsaved.delete(key);
	} catch (error) {
		if (key === 'config' || key === 'workbook') storage_unsaved.add(key);
		throw error;
	} finally { storage_notice(); }
}
const appStorage = {
	getItem(key) {
		try { return localStorage.getItem(STORAGE_PREFIX + key); }
		catch (error) { return null; }
	},
	setItem(key, value) { storage_write(key, () => localStorage.setItem(STORAGE_PREFIX + key, value)); },
	removeItem(key) { storage_write(key, () => localStorage.removeItem(STORAGE_PREFIX + key)); },
};

// Copy legacy values once, without deleting another application's generic keys
// or overwriting newer namespaced values.
try {
	if (appStorage.getItem('migrated') === null) {
		const legacy = localStorage.getItem('config');
		if (legacy && /^\[sports\]/m.test(legacy)) {
			['config', 'workbook', 'theme', 'panel', 'sheet', 'sheet-order', 'plan-rules', 'plan-cautions'].forEach(key => {
				const value = localStorage.getItem(key);
				if (value !== null && appStorage.getItem(key) === null)
					appStorage.setItem(key, value);
			});
		}
		appStorage.setItem('migrated', '1');
	}
} catch (error) {
	// Private browsing or full storage must not prevent opening the app.
}


document.addEventListener('DOMContentLoaded', () => {
	storage_notice();
	document.getElementById('save-retry').addEventListener('click', () => {
		if (ui_program_drawn()) wb_save();
		else document.getElementById('save').click();
	});
});
window.addEventListener?.('beforeunload', event => {
	if (storage_unsaved.size) { event.preventDefault(); event.returnValue = ''; }
});
