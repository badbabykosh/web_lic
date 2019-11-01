/* Web Lic - Copyright (C) 2018 Remi Gagne */

import _ from './util';
import uiState from './ui_state';

const keys = {
	model: 'lic_model',
	ui: 'ui_defaults',
	customFonts: 'custom_fonts',
	customBrickColors: 'custom_brick_colors'
};

const api = {
	// TODO: Do *NOT* assume local storage always contains default UI settings.  If localStorage
	// is wiped mid-model edit, Lic should not crash.
	initialize(defaultState) {
		if (localStorage.length === 0 || localStorage.getItem(keys.ui) == null) {
			localStorage.setItem(keys.ui, JSON.stringify(defaultState));
		}
	},
	get: {},
	save: {},
	replace: {},
	clear: {}  // TODO: update status bar when stuff is cleared.  Should update status bar more in general
};

// Add default implementations of 'get', 'save' and 'clear' for each key
_.forOwn(keys, (v, k) => {
	api.get[k] = function() {
		return JSON.parse(localStorage.getItem(v));
	};
	api.replace[k] = function(json) {  // Replace entire object in cache with passed in object
		try {
			localStorage.setItem(v, JSON.stringify(json));
		} catch (e) {
			if (e && e.name === 'QuotaExceededError') {
				// TODO: use compression to save this giant state
				return json;
			}
		}
		return json;
	};
	api.clear[k] = function() {
		localStorage.removeItem(v);
	};
	api.save[k] = function(json) {  //  Set only the properties in json in the cached object
		const target = api.get[k](v);
		_.forOwn(json, (value, key) => {
			target[key] = value;
		});
		api.replace[k](target);
	};
});

api.clear.ui = function() {
	// Don't leave local storage UI state empty; copy default UI state back to local storage.
	api.replace.ui(uiState.getDefaultState());
	uiState.resetUIState();
};

api.clear.everything = function() {
	localStorage.clear();
	api.clear.ui();
};

api.get.customFonts = function() {
	const res = localStorage.getItem(keys.customFonts);
	if (res == null) {  // If key is totally null, save and return an empty array instead
		return api.replace.customFonts([]);
	}
	return JSON.parse(res);
};

api.get.customBrickColors = function() {
	const res = localStorage.getItem(keys.customBrickColors);
	if (res == null) {  // If key is totally null, save and return an empty array instead
		return api.replace.customBrickColors({});
	}
	return JSON.parse(res);
};

export default api;
