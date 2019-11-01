/* Web Lic - Copyright (C) 2018 Remi Gagne */

import _ from './util';
import store from './store';
import LDParse from './ld_parse';
import uiState from './ui_state';

const api = {

	page(page, canvas, config = {}) {  // config: {hiResScale, selectedItem, noCache}

		const hiResScale = config.hiResScale = config.hiResScale || 1;
		if (page.needsLayout) {
			store.mutations.page.layout({page});
		}

		const ctx = canvas.getContext('2d');
		ctx.save();
		if (hiResScale > 1) {
			ctx.scale(hiResScale, hiResScale);
		}

		const template = store.state.template.page;
		ctx.clearRect(0, 0, template.width, template.height);

		const rectStyle = {
			strokeStyle: template.border.color,
			// * 2 because line is centered on page edge, so half of it is clipped
			lineWidth: Math.floor(template.border.width * 2)
		};

		if (template.fill.color) {
			ctx.fillStyle = template.fill.color;
			ctx.fillRect(0, 0, template.width, template.height);
		}

		if (template.fill.image) {
			const cachedImage = store.cache.get('page', 'backgroundImage');
			if (cachedImage) {
				api.pageBackground(cachedImage, template.fill.image, ctx);
			} else {
				const image = new Image();
				image.onload = () => {
					// TODO: this gets called multiple times on initial page load
					store.cache.set('page', 'backgroundImage', image);
					api.page(page, canvas, config);
				};
				image.src = template.fill.image.src;
				return;
			}
		}

		if (template.border.cornerRadius > template.border.width) {
			// On very rounded page corners, outside corner radius shows up inside the page.  Fill that in.
			const s = template.border.cornerRadius / 2;
			ctx.fillStyle = template.border.color;
			ctx.fillRect(0, 0, s, s);
			ctx.fillRect(template.width - s, 0, s, s);
			ctx.fillRect(template.width - s, template.height - s, s, s);
			ctx.fillRect(0, template.height - s, s, s);
		}

		api.roundedRectStyled(
			// offset corner radius by border width so radius defines inner border radius
			ctx, 0, 0, template.width, template.height,
			template.border.cornerRadius + template.border.width, rectStyle
		);

		if (uiState.get('grid').enabled) {
			api.grid(ctx, template.width, template.height);
		}

		ctx.translate(Math.floor(page.innerContentOffset.x), Math.floor(page.innerContentOffset.y));

		page.steps.forEach(id => api.step({type: 'step', id}, ctx, config));

		if (page.stretchedStep) {
			ctx.save();
			ctx.translate(Math.floor(page.stretchedStep.leftOffset), 0);
			api.step({type: 'step', id: page.stretchedStep.stepID}, ctx, config);
			ctx.restore();
		}

		page.pliItems.forEach(id => api.pliItem({type: 'pliItem', id}, ctx, config));

		api.dividers(page.dividers, ctx);

		if (page.numberLabelID != null) {
			ctx.save();
			const lbl = store.get.numberLabel(page.numberLabelID);
			ctx.fillStyle = template.numberLabel.color;
			ctx.font = template.numberLabel.font;
			ctx.textAlign = lbl.align || 'start';
			ctx.textBaseline = lbl.valign || 'alphabetic';
			ctx.fillText(page.number, lbl.x, lbl.y);
			ctx.restore();
		}

		page.annotations.forEach(id => {
			api.annotation(store.get.annotation(id), ctx);
		});
		ctx.restore();

		// Draw highlight box around the selected page item, if any
		if (config.selectedItem) {
			let doHighlight = false;
			const itemPage = store.get.pageForItem(config.selectedItem);
			if (_.itemEq(itemPage, page)) {
				doHighlight = true;
			} else if (page.stretchedStep) {
				const stretchedStep = store.get.step(page.stretchedStep.stepID);
				if (store.get.isDescendent(config.selectedItem, stretchedStep)) {
					doHighlight = true;
				}
			}
			if (doHighlight) {
				const box = store.get.highlightBox(config.selectedItem, template, page);
				api.highlight(ctx, box);
			}
		}
	},

	// TODO: Add support for a quantity label to a step. Useful on last step of a submodel built many times.
	step(step, ctx, config) {

		step = store.get.step(step);

		ctx.save();
		ctx.translate(Math.floor(step.x), Math.floor(step.y));

		if (step.csi == null && step.steps.length) {
			step.steps.forEach(id => api.step({type: 'step', id}, ctx, config));
		} else if (step.csiID != null) {
			api.csi(step.csiID, ctx, config);
		}

		step.submodelImages.forEach(submodelImageID => {
			api.submodelImage(submodelImageID, ctx, config);
		});

		step.callouts.forEach(calloutID => {
			api.callout(calloutID, ctx, config);
		});

		if (step.pliID != null && store.state.plisVisible) {
			api.pli(step.pliID, ctx, config);
		}

		if (step.numberLabelID != null) {
			let template = store.state.template;
			template = (step.parent.type === 'callout') ? template.callout.step : template.step;
			const lbl = store.get.numberLabel(step.numberLabelID);
			ctx.fillStyle = template.numberLabel.color;
			ctx.font = template.numberLabel.font;
			ctx.textAlign = lbl.align || 'start';
			ctx.textBaseline = lbl.valign || 'alphabetic';
			ctx.fillText(step.number + '', lbl.x, lbl.y);
		}

		if (step.rotateIconID != null) {
			api.rotateIcon(step.rotateIconID, ctx);
		}

		api.dividers(step.dividers, ctx);

		step.annotations.forEach(id => {
			api.annotation(store.get.annotation(id), ctx);
		});
		ctx.restore();
	},

	submodelImage(submodelImage, ctx, {hiResScale, noCache}) {
		submodelImage = store.get.submodelImage(submodelImage);
		const template = store.state.template.submodelImage;
		const csi = store.get.csi(submodelImage.csiID);

		const rectStyle = {
			fillStyle: template.fill.color,
			strokeStyle: template.border.color,
			lineWidth: template.border.width
		};
		api.roundedRectItemStyled(ctx, submodelImage, template.border.cornerRadius, rectStyle);

		ctx.save();
		ctx.translate(
			Math.floor(submodelImage.innerContentOffset.x),
			Math.floor(submodelImage.innerContentOffset.y)
		);

		ctx.save();
		ctx.scale(1 / hiResScale, 1 / hiResScale);
		const part = LDParse.model.get.abstractPart(submodelImage.modelFilename);
		const siCanvas = store.render.pli(part.colorCode, part.filename, csi, hiResScale, noCache).container;
		const x = Math.floor((submodelImage.x + csi.x) * hiResScale);
		const y = Math.floor((submodelImage.y + csi.y) * hiResScale);
		ctx.drawImage(siCanvas, x, y);
		ctx.restore();

		if (submodelImage.quantityLabelID != null) {
			ctx.save();
			const lbl = store.get.quantityLabel(submodelImage.quantityLabelID);
			ctx.fillStyle = template.quantityLabel.color;
			ctx.font = template.quantityLabel.font;
			ctx.textAlign = lbl.align || 'start';
			ctx.textBaseline = lbl.valign || 'alphabetic';
			ctx.fillText('x' + submodelImage.quantity, lbl.x, lbl.y);
			ctx.restore();
		}
		ctx.restore();
	},

	csi(csi, ctx, {hiResScale, selectedItem, noCache}) {
		csi = store.get.csi(csi);
		const step = store.get.parent(csi);
		const localModel = LDParse.model.get.abstractPart(step.model.filename);

		ctx.save();
		ctx.translate(Math.floor(csi.x), Math.floor(csi.y));

		ctx.save();
		ctx.scale(1 / hiResScale, 1 / hiResScale);
		const havePart = selectedItem && selectedItem.type === 'part' && selectedItem.stepID === step.id;
		const selectedPartIDs = havePart ? [selectedItem.id] : null;
		const renderer = selectedPartIDs == null ? 'csi' : 'csiWithSelection';
		const res = store.render[renderer](localModel, step, csi, selectedPartIDs, hiResScale, noCache);
		if (res) {
			ctx.drawImage(res.container, Math.floor(-res.dx), Math.floor(-res.dy));
		}
		ctx.restore();

		csi.annotations.forEach(id => {
			api.annotation(store.get.annotation(id), ctx);
		});
		ctx.restore();
	},

	pli(pli, ctx, {hiResScale, noCache}) {
		const template = store.state.template;
		pli = store.get.pli(pli);

		let pliItems = pli.pliItems;
		if (!template.pli.includeSubmodels) {
			pliItems = pliItems.filter(id => {
				return !store.get.pliItemIsSubmodel({id, type: 'pliItem'});
			});
		}

		if (_.isEmpty(pliItems)) {
			return;
		}
		const rectStyle = {
			fillStyle: template.pli.fill.color,
			strokeStyle: template.pli.border.color,
			lineWidth: template.pli.border.width
		};
		api.roundedRectItemStyled(ctx, pli, template.pli.border.cornerRadius, rectStyle);

		ctx.save();
		ctx.translate(Math.floor(pli.innerContentOffset.x), Math.floor(pli.innerContentOffset.y));
		ctx.translate(Math.floor(pli.x), Math.floor(pli.y));
		pliItems.forEach(idx => {
			api.pliItem(idx, ctx, {hiResScale, noCache});
		});
		ctx.restore();
	},

	pliItem(pliItem, ctx, {hiResScale, noCache}) {
		ctx.save();
		ctx.scale(1 / hiResScale, 1 / hiResScale);
		pliItem = store.get.pliItem(pliItem);
		const pliCanvas = store.render.pli(
			pliItem.colorCode, pliItem.filename, pliItem, hiResScale, noCache
		).container;
		const x = Math.floor(pliItem.x) * hiResScale;
		const y = Math.floor(pliItem.y) * hiResScale;
		ctx.drawImage(pliCanvas, x, y);
		ctx.restore();

		const template = store.state.template.pliItem.quantityLabel;
		const quantityLabel = store.get.quantityLabel(pliItem.quantityLabelID);
		ctx.fillStyle = template.color;
		ctx.font = template.font;
		ctx.textBaseline = quantityLabel.valign || 'top';
		ctx.fillText(
			'x' + pliItem.quantity,
			pliItem.x + quantityLabel.x,
			pliItem.y + quantityLabel.y
		);
	},

	callout(callout, ctx, config) {
		const template = store.state.template.callout;
		callout = store.get.callout(callout);
		ctx.save();

		const rectStyle = {
			fillStyle: template.fill.color,
			strokeStyle: template.border.color,
			lineWidth: template.border.width
		};
		api.roundedRectItemStyled(ctx, callout, template.border.cornerRadius, rectStyle);

		ctx.translate(Math.floor(callout.x), Math.floor(callout.y));
		ctx.translate(Math.floor(callout.innerContentOffset.x), Math.floor(callout.innerContentOffset.y));

		callout.steps.forEach(id => api.step({type: 'step', id}, ctx, config));
		ctx.restore();

		ctx.strokeStyle = template.arrow.border.color;
		ctx.fillStyle = template.arrow.border.color;
		ctx.lineWidth = template.arrow.border.width;
		callout.calloutArrows.forEach(arrowID => {
			api.calloutArrow(arrowID, ctx);
		});
	},

	calloutArrow(arrow, ctx) {
		arrow = store.get.calloutArrow(arrow);
		const border = store.state.template.callout.arrow.border;
		if (!_.isBorderVisible(border)) {
			return;
		}
		api.annotation({
			id: arrow.id,
			type: arrow.type,
			annotationType: (arrow.points.length > 2) ? 'arrow' : 'stairStepArrow',
			parent: store.get.parent(arrow.parent),
			border,
			points: arrow.points,
			direction: arrow.direction
		}, ctx);
	},

	rotateIcon(icon, ctx) {
		const template = store.state.template.rotateIcon;
		icon = store.get.rotateIcon(icon);
		const scale = {  // Icon is drawn in 100 x 94 space; scale to that
			width: icon.width / 100,  // TODO: put Layout.rotateIconAspectRatio somewhere easier to read
			height: icon.height / 94
		};

		ctx.strokeStyle = template.border.color;
		ctx.lineWidth = template.border.width;
		ctx.save();
		ctx.translate(Math.floor(icon.x), Math.floor(icon.y));
		ctx.scale(scale.width, scale.height);

		if (template.fill.color) {
			ctx.fillStyle = template.fill.color;
			api.roundedRect(ctx, 0, 0, 100, 94, 15);
			ctx.fill();
		}

		const haveBorder = _.isBorderVisible(template.border);
		if (haveBorder) {
			api.roundedRect(ctx, 0, 0, 100, 94, 15);
		}
		ctx.restore();
		if (haveBorder) {
			ctx.stroke();  // Stroke in unscaled space to ensure borders of constant width
		}

		if (_.isBorderVisible(template.arrow.border)) {
			ctx.fillStyle = ctx.strokeStyle = template.arrow.border.color;
			ctx.lineWidth = template.arrow.border.width;
			ctx.save();
			ctx.translate(Math.floor(icon.x), Math.floor(icon.y));
			ctx.scale(scale.width, scale.height);
			ctx.beginPath();
			ctx.arc(50, 38, 39, _.radians(29), _.radians(130));
			ctx.stroke();

			ctx.beginPath();
			ctx.arc(50, 56, 39, _.radians(180 + 29), _.radians(180 + 130));
			ctx.stroke();

			api.arrowHead(ctx, 24, 67, 135, [1, 0.7]);
			ctx.fill();
			api.arrowHead(ctx, 75, 27, -45, [1, 0.7]);
			ctx.fill();
		}
		ctx.restore();
	},

	arrowHead: (() => {

		const presetAngles = {up: 180, left: 90, right: -90};
		const arrowDimensions = _.geom.arrow();

		return function(ctx, baseX, baseY, rotation, scale) {
			const head = arrowDimensions.head, bodyWidth = 1.25;
			ctx.save();
			ctx.translate(baseX, baseY);
			if (rotation in presetAngles) {
				ctx.rotate(_.radians(presetAngles[rotation]));
			} else if (typeof rotation === 'number') {
				ctx.rotate(_.radians(rotation));
			}
			if (scale) {
				if (Array.isArray(scale)) {
					ctx.scale(scale[0], scale[1]);
				} else {
					ctx.scale(scale, scale);
				}
			}
			ctx.beginPath();
			ctx.moveTo(0, 0);
			ctx.lineTo(bodyWidth, 0);
			ctx.lineTo(head.width, -head.insetDepth);
			ctx.lineTo(0, head.length - head.insetDepth);
			ctx.lineTo(-head.width, -head.insetDepth);
			ctx.lineTo(-bodyWidth, 0);
			ctx.closePath();
			ctx.restore();
		};
	})(),

	annotation: (() => {

		function transformPoint(pt, annotation, borderWidth) {
			if (!pt.relativeTo) {
				return pixelOffset(pt, borderWidth);
			}
			// We're in an arbitrarily transformed coordinate space, defined by annotation's parent.
			// relativeTo is either before or after parent in the transform stack.
			// We need to transform back / forward to pt's relativeTo coordinate space.
			let {x, y} = pt;
			let relativeTo = store.get.lookupToItem(pt.relativeTo);
			let parent = store.get.parent(annotation);
			if (parent === relativeTo) {
				return pixelOffset(pt, borderWidth);
			}
			// Start from relativeTo and walk the transform backward; if we hit parent, return that transform
			while (relativeTo) {
				x += relativeTo.x || 0;
				y += relativeTo.y || 0;
				relativeTo = store.get.parent(relativeTo);
				if (parent === relativeTo) {
					return pixelOffset({x, y}, borderWidth);
				}
			}
			// Haven't found target, and we've transformed to the page, so start from the parent
			// and walk the transform forward until we hit the page
			while (parent) {
				x -= parent.x || 0;
				y -= parent.y || 0;
				parent = store.get.parent(parent);
			}
			return pixelOffset({x, y}, borderWidth);
		}

		const drawLookup = {

			label(annotation, ctx) {
				const x = Math.floor(annotation.x);
				const y = Math.floor(annotation.y);
				ctx.fillStyle = annotation.color || 'black';
				ctx.font = annotation.font || 'bold 20pt Helvetica';
				ctx.align = annotation.align || 'left';
				ctx.textBaseline = annotation.valign || 'alphabetic';
				ctx.fillText(annotation.text, x, y);
			},

			arrow(annotation, ctx) {
				const border = annotation.border || {color: 'black', width: 1};
				ctx.strokeStyle = border.color || 'black';
				ctx.fillStyle = border.color || 'black';
				ctx.lineWidth = border.width;
				ctx.beginPath();
				annotation.points.forEach((pt, idx) => {
					pt = store.get.point(pt) || pt;
					pt = transformPoint(pt, annotation, border.width);
					ctx[(idx === 0) ? 'moveTo' : 'lineTo'](pt.x, pt.y);
				});
				ctx.stroke();
				let lastPt = _.last(annotation.points);
				lastPt = store.get.point(lastPt) || lastPt;
				const tip = transformPoint(lastPt, annotation, border.width);
				api.arrowHead(ctx, tip.x, tip.y, annotation.direction);
				ctx.fill();
			},

			stairStepArrow(annotation, ctx) {
				const direction = annotation.direction;
				annotation.annotationType = 'arrow';
				let points = annotation.points.map(pt => {
					pt = store.get.point(pt);
					return transformPoint(pt, annotation, annotation.border.width);
				});
				if (points[0].x === points[1].x || points[0].y === points[1].y) {
					api.annotation(annotation, ctx);
					return;
				}
				const bbox = _.geom.bbox(points);

				points = [points[0], _.cloneDeep(points[0]), _.cloneDeep(points[0]), points[1]];

				let midX = points[0].x, midY = points[0].y;
				if (direction === 'up') {
					midY -= bbox.height / 2;
				} else if (direction === 'right') {
					midX += bbox.width / 2;
				} else if (direction === 'down') {
					midY += bbox.height / 2;
				} else {
					midX -= bbox.width / 2;
				}

				points[1].x = points[2].x = midX;
				points[1].y = points[2].y = midY;

				if (direction === 'up' || direction === 'down') {
					points[2].x = points[3].x;
				} else {
					points[2].y = points[3].y;
				}
				annotation.points = points;
				api.annotation(annotation, ctx);
			},

			image(annotation, ctx) {
				const cachedImage = store.cache.get(annotation, 'rawImage');
				if (cachedImage && cachedImage !== 'pending') {
					const x = Math.floor(annotation.x);
					const y = Math.floor(annotation.y);
					ctx.drawImage(cachedImage, x, y);
				} else if (cachedImage == null) {
					store.cache.set(annotation, 'rawImage', 'pending');  // Avoid caching multiple times
					const image = new Image();
					image.onload = function() {
						annotation.width = this.width;
						annotation.height = this.height;
						store.cache.set(annotation, 'rawImage', image);
						const page = store.get.pageForItem(annotation);
						api.page(page, ctx.canvas);
					};
					image.src = annotation.src;
				}
			}
		};

		return function(annotation, ctx) {
			drawLookup[annotation.annotationType](annotation, ctx);
		};
	})(),

	pageBackground(cachedImage, imageInfo = {}, ctx) {
		if (imageInfo.x != null && imageInfo.y != null) {
			ctx.drawImage(cachedImage,
				imageInfo.x, imageInfo.y,
				imageInfo.width, imageInfo.height
			);
		} else {
			ctx.drawImage(cachedImage, 0, 0);
		}
	},

	dividers(dividerList, ctx) {
		const template = store.state.template.divider.border;
		if (!_.isBorderVisible(template)) {
			return;
		}
		ctx.strokeStyle = template.color;
		ctx.lineWidth = template.width;
		dividerList.forEach(id => {
			const divider = store.get.divider(id);
			ctx.beginPath();
			const p1 = pixelOffset(divider.p1, template.width);
			ctx.moveTo(p1.x, p1.y);
			const p2 = pixelOffset(divider.p2, template.width);
			ctx.lineTo(p2.x, p2.y);
			ctx.stroke();
		});
	},

	highlight(ctx, box) {
		ctx.save();
		ctx.strokeStyle = '#2eb9ce';
		ctx.lineWidth = 3;
		ctx.setLineDash([5, 3]);
		ctx.strokeRect(box.x, box.y, box.width, box.height);
		ctx.restore();
	},

	grid(ctx, width, height) {

		const grid = uiState.get('grid');
		let gridPath = store.cache.get('uiState', 'gridPath');
		if (gridPath == null) {
			gridPath = api.buildGrid(grid, width, height);
			store.cache.set('uiState', 'gridPath', gridPath);
		}

		ctx.save();
		ctx.lineWidth = grid.line.width;
		if (grid.line.color === 'auto') {
			const pageColor = store.state.template.page.fill.color;
			ctx.strokeStyle = _.color.opposite(pageColor);
		} else {
			ctx.strokeStyle = grid.line.color;
		}
		if (!_.isEmpty(grid.line.dash)) {
			ctx.setLineDash(grid.line.dash);
		}
		ctx.stroke(gridPath);
		ctx.restore();
	},

	buildGrid(grid, width, height) {
		const gridSize = Math.max(1, Math.floor(grid.spacing));
		const po = (grid.line.width % 2) ? 0.5 : 0;
		const path = new Path2D();
		let x = grid.offset.left, y = grid.offset.top;

		while (x < width) {  // vertical lines
			path.moveTo(x + po, 0);
			path.lineTo(x + po, height);
			x += gridSize;
		}
		while (y < height) {  // horizontal lines
			path.moveTo(0, y + po);
			path.lineTo(width, y + po);
			y += gridSize;
		}
		return path;
	},

	roundedRectItemStyled(ctx, item, r, style) {
		let {x, y, width, height} = item;
		if (item.borderOffset) {
			x += item.borderOffset.x;
			y += item.borderOffset.y;
		}
		if (item.innerContentOffset) {
			x += item.innerContentOffset.x / 2;
			y += item.innerContentOffset.y / 2;
			width -= item.innerContentOffset.x;
			height -= item.innerContentOffset.y;
		}
		api.roundedRectStyled(ctx, x, y, width, height, r, style);
	},

	roundedRectStyled(ctx, x, y, w, h, r, style) {
		ctx.save();
		if (_.color.isVisible(style.fillStyle)) {
			ctx.fillStyle = style.fillStyle;
			api.roundedRect(ctx, x, y, w, h, r, style.lineWidth);
			ctx.fill();
		}
		if (_.isBorderVisible({width: style.lineWidth, color: style.strokeStyle})) {
			ctx.strokeStyle = style.strokeStyle;
			ctx.lineWidth = style.lineWidth;
			api.roundedRect(ctx, x, y, w, h, r, style.lineWidth);
			ctx.stroke();
		}
		ctx.restore();
	},

	roundedRect(ctx, x, y, w, h, r, lineWidth) {
		// r defines the inner curve, but we're drawing from the middle, so offset r accordingly
		// r += lineWidth / 2;  //Disabled for now because it doesn't look right.
		({x, y} = pixelOffset({x, y}, lineWidth));
		w = Math.floor(w);
		h = Math.floor(h);
		ctx.beginPath();
		ctx.arc(x + r, y + r, r, Math.PI, 3 * Math.PI / 2);
		ctx.arc(x + w - r, y + r, r, 3 * Math.PI / 2, 0);
		ctx.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
		ctx.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
		ctx.closePath();
	}
};

function pixelOffset({x, y}, lineWidth) {
	x = Math.floor(x);
	y = Math.floor(y);
	if (lineWidth % 2) {  // Avoid half-pixel offset blurry lines
		x += 0.5;
		y += 0.5;
	}
	return {x, y};
}

export default api;
