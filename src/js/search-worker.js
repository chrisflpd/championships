// Keep parsing, pairing and backtracking off the UI thread. Termination cancels
// even pairing work that has not yet reached the scheduler's time limit.
importScripts(...['common.js', 'parser.js', 'championships.js', 'scheduling_algorithms.js']
	.map(file => file + self.location.search));
let loaded = false;
self.onmessage = ({ data }) => {
	try {
		if (!loaded) { parse_config(data.text); schedule_forget_best(); loaded = true; }
		relax_adjacency = data.relaxed;
		const program = search_run_window();
		// Sports contain functions; the UI reconnects those from its configuration.
		self.postMessage({ program: program ? JSON.parse(JSON.stringify(program)) : null, progress: search_progress() });
	} catch (error) { self.postMessage({ error: error.message }); }
};
