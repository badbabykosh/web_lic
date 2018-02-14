/* global Vue: false, LDParse: false */

// eslint-disable-next-line no-implicit-globals, no-undef
ContextMenu = (function() {
'use strict';

let undoStack, app, store;

const contextMenu = {
	page: [
		{text: 'Auto Layout (NYI)', cb: () => {}},
		{text: 'Use Vertical Layout (NYI)', cb: () => {}},
		{text: 'Layout By Row and Column (NYI)', cb: () => {}},
		{text: 'separator'},
		{text: 'Prepend Blank Page (NYI)', cb: () => {}},
		{text: 'Append Blank Page (NYI)', cb: () => {}},
		{text: 'separator'},
		{text: 'Hide Step Separators (NYI)', cb: () => {}},
		{text: 'Add Blank Step (NYI)', cb: () => {}},
		{text: 'Add Annotation (NYI)', cb: () => {}},
		{
			text: 'Delete This Blank Page',
			shown: () => {
				if (app && app.selectedItemLookup && app.selectedItemLookup.type === 'page') {
					const page = store.get.lookupToItem(app.selectedItemLookup);
					return page.steps.length < 1;
				}
				return false;
			},
			cb: () => {
				const page = store.get.lookupToItem(app.selectedItemLookup);
				const nextPage = store.get.isLastPage(page) ? store.get.prevPage(page, true) : store.get.nextPage(page);
				undoStack.commit('deletePage', page, 'Delete Page');
				Vue.nextTick(() => {
					app.setCurrentPage(nextPage);
				});
			}
		}
	],
	pageNumber: [
		{text: 'Change Page Number (NYI)', cb: () => {}}
	],
	step: [
		{
			text: 'Move Step to Previous Page',
			shown: () => {
				if (app && app.selectedItemLookup && app.selectedItemLookup.type === 'step') {
					const page = store.get.pageForItem(app.selectedItemLookup);
					if (store.get.isFirstPage(page) || store.get.isTitlePage(page)) {
						return false;  // Previous page doesn't exist
					} else if (page.steps.indexOf(app.selectedItemLookup.id) !== 0) {
						return false;  // Can only move first step on a page to the previous page
					}
					return true;
				}
				return false;
			},
			cb: function() {
				undoStack.commit('moveStepToPreviousPage', app.selectedItemLookup, this.text);
				app.redrawUI(true);
			}
		},
		{
			text: 'Move Step to Next Page',
			shown: () => {
				if (app && app.selectedItemLookup && app.selectedItemLookup.type === 'step') {
					const page = store.get.pageForItem(app.selectedItemLookup);
					if (store.get.isLastPage(page)) {
						return false;  // Previous page doesn't exist
					} else if (page.steps.indexOf(app.selectedItemLookup.id) !== page.steps.length - 1) {
						return false;  // Can only move last step on a page to the next page
					}
					return true;
				}
				return false;
			},
			cb: function() {
				undoStack.commit('moveStepToNextPage', app.selectedItemLookup, this.text);
				app.redrawUI(true);
			}
		},
		{text: 'separator'},
		{
			text: 'Merge Step with Previous Step',
			shown: () => {
				if (app && app.selectedItemLookup && app.selectedItemLookup.type === 'step') {
					const step = store.get.lookupToItem(app.selectedItemLookup);
					return store.state.steps.indexOf(step) > 1;  // First 'step' is the title page content, which can't be merged
				}
				return false;
			},
			cb: function() {
				undoStack.commit(
					'mergeSteps',
					{sourceStepID: app.selectedItemLookup.id, destStepID: app.selectedItemLookup.id - 1},
					this.text
				);
				Vue.nextTick(() => {
					app.clearSelected();
					app.drawCurrentPage();
				});
			}
		},
		{
			text: 'Merge Step with Next Step',
			shown: () => {
				if (app && app.selectedItemLookup && app.selectedItemLookup.type === 'step') {
					const step = store.get.lookupToItem(app.selectedItemLookup);
					return store.state.steps.indexOf(step) < store.state.steps.length - 1;
				}
				return false;
			},
			cb: function() {
				undoStack.commit(
					'mergeSteps',
					{sourceStepID: app.selectedItemLookup.id, destStepID: app.selectedItemLookup.id + 1},
					this.text
				);
				Vue.nextTick(() => {
					app.clearSelected();
					app.drawCurrentPage();
				});
			}
		}
	],
	stepNumber: [
		{text: 'Change Step Number (NYI)', cb: () => {}}
	],
	csi: [
		{text: 'Rotate CSI (NYI)', cb: () => {}},
		{text: 'Scale CSI (NYI)', cb: () => {}},
		{text: 'separator'},
		{
			text: 'Select Part (NYI)',
			shown: () => {
				if (app && app.selectedItemLookup && app.selectedItemLookup.type === 'csi') {
					const step = store.get.parent(app.selectedItemLookup);
					return step && step.parts && step.parts.length;
				}
				return false;
			},
			children: () => {
				if (app && app.selectedItemLookup && app.selectedItemLookup.type === 'csi') {
					const step = store.get.parent(app.selectedItemLookup);
					return step.parts.map(idx => {
						const part = store.model.parts[idx];
						const abstractPart = LDParse.partDictionary[part.filename];
						return {
							text: abstractPart.name,
							cb: function() {
								app.setSelected({type: 'part', id: idx, csiID: step.csiID});
							}
						};
					});
				}
				return null;
			}
		},
		{text: 'Add New Part (NYI)', cb: () => {}}
	],
	pli: [],
	pliItem: [
		{text: 'Rotate PLI Part (NYI)', cb: () => {}},
		{text: 'Scale PLI Part (NYI)', cb: () => {}}
	],
	label: [
		{
			text: 'Set...',
			children: [
				{text: 'Text (NYI)', cb: () => {}},
				{text: 'Font (NYI)', cb: () => {}},
				{text: 'Color (NYI)', cb: () => {}}
			]
		}
	],
	part: [
		{text: 'Move Part to Previous Step', cb: () => {}},
		{text: 'Move Part to Next Step', cb: () => {}}
	]
};

return function(menuEntry, localApp, localStore, localUndoStack) {
	app = localApp;
	store = localStore;
	undoStack = localUndoStack;
	return contextMenu[menuEntry];
};

})();
