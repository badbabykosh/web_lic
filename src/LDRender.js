/* Web Lic - Copyright (C) 2018 Remi Gagne */

/* global THREE: false */
'use strict';

import LDParse from './LDParse';

let renderer, camera, measurementCanvas;
let isInitialized = false;
const selectedLineColor = 0xFF0000;
let rad, deg, lineMaterial, faceMaterials, selectedFaceMaterial, arrowMaterial;

const renderState = {
	zoom: 500,
	edgeWidth: 0.0008
};

const api = {

	// Render the chosen part filename with the chosen color code to the chosen container.
	// Return a {width, height} object representing the size of the rendering.
	// Optional config: {resizeContainer, dx, dy, rotation: {x, y, z}}
	renderPart(colorCode, filename, containerID, size, config) {

		size = Math.max(Math.floor(size), 1);
		config = config || {};
		config.size = size;

		initialize();
		const scene = initScene(size);

		addPartToScene(scene, colorCode, filename, config);
		const res = render(scene, size, containerID, config);
		cleanup(scene);
		return res;
	},
	renderModel(part, containerID, size, config) {

		size = Math.max(Math.floor(size), 1);
		config = config || {};
		config.size = size;
		if (!config.partList) {
			config.partList = part.parts.map((part, idx) => idx);
		}

		initialize();
		const scene = initScene(size);

		addModelToScene(scene, part, config.partList, config);
		const res = render(scene, size, containerID, config);
		cleanup(scene);
		return res;
	},

	// Renders the model twice; once with all parts unselected and once with parts selected.
	// It renders the selected part to containerID, and returns the difference in position
	// between the selected and unselected renderings.  This is useful for offsetting renderings
	// so that they do not change positions when rendered with & without selected parts.
	renderAndDeltaSelectedPart(part, containerID, size, config) {

		config = config || {};
		config.size = size;
		if (!config.partList) {
			config.partList = part.parts.map((part, idx) => idx);
		}

		initialize();
		let scene = initScene(size);

		// Render with no parts selected
		config.includeSelection = false;
		addModelToScene(scene, part, config.partList, config);
		const noSelectedPartsBounds = render(scene, size, containerID, config);

		scene = initScene(size);

		// Render again with parts selected
		config.includeSelection = true;
		addModelToScene(scene, part, config.partList, config);
		const selectedPartsBounds = render(scene, size, containerID, config);
		cleanup(scene);

		return {
			dx: Math.max(0, noSelectedPartsBounds.x - selectedPartsBounds.x),
			dy: Math.max(0, noSelectedPartsBounds.y - selectedPartsBounds.y)
		};
	},

	LDMatrixToTransform(m) {
		const position = new THREE.Vector3();
		const quaternion = new THREE.Quaternion();
		const scale = new THREE.Vector3();
		const matrix = LDMatrixToMatrix(m);
		matrix.decompose(position, quaternion, scale);
		const rotation = new THREE.Euler();
		rotation.setFromQuaternion(quaternion);
		rotation.x = deg(rotation.x);
		rotation.y = deg(rotation.y);
		rotation.z = deg(rotation.z);
		return {position, rotation, scale};
	},

	TransformToLDMatrix(transform) {
		const rot = transform.rotation;
		const euler = new THREE.Euler(rad(rot.x), rad(rot.y), rad(rot.z));
		const matrix = new THREE.Matrix4();
		matrix.makeRotationFromEuler(euler);
		matrix.setPosition(transform.position);
		return MatrixToLDMatrix(matrix).map(el => Math.abs(el) < 0.0000001 ? 0 : el);
	},

	setPartDictionary(dict) {
		api.partDictionary = dict;  // Part dictionary {partName : abstractPart} as created by LDParse
	},
	partDictionary: {},

	setRenderState(newState) {
		initialize();
		if (newState.zoom != null) {
			const viewBox = renderState.zoom = 500 + (newState.zoom * -10);
			if (camera != null) {
				camera.right = camera.top = viewBox;
				camera.left = camera.bottom = -viewBox;
				camera.position.set(viewBox, -viewBox * 0.7, -viewBox);
			}
		}
		if (newState.edgeWidth != null) {
			renderState.edgeWidth = newState.edgeWidth * 0.0002;
			lineMaterial.linewidth = renderState.edgeWidth;
		}
	}
};

/* eslint-disable no-labels */
function contextBoundingBox(data, w, h) {
	let x, y, minX, minY, maxX, maxY;
	o1: {
		for (y = h; y--;) {
			for (x = w; x--;) {
				if (data[(w * y + x) * 4 + 3] > 0) {
					maxY = y;
					break o1;
				}
			}
		}
	}
	if (!maxY) {
		return null;
	}
	o2: {
		for (x = w; x--;) {
			for (y = maxY + 1; y--;) {
				if (data[(w * y + x) * 4 + 3] > 0) {
					maxX = x;
					break o2;
				}
			}
		}
	}
	o3: {
		for (x = 0; x <= maxX; ++x) {
			for (y = maxY + 1; y--;) {
				if (data[(w * y + x) * 4 + 3] > 0) {
					minX = x;
					break o3;
				}
			}
		}
	}
	o4: {
		for (y = 0; y <= maxY; ++y) {
			for (x = minX; x <= maxX; ++x) {
				if (data[(w * y + x) * 4 + 3] > 0) {
					minY = y;
					break o4;
				}
			}
		}
	}
	return {
		x: minX, y: minY,
		maxX: maxX, maxY: maxY,
		w: maxX - minX, h: maxY - minY
	};
}
/* eslint-enable no-labels */

function initialize() {

	if (api.partDictionary == null) {
		throw 'LDRender: You must set a partDictionary via LDRender.setPartDictionary() before rendering a part.';  // eslint-disable-line max-len
	} else if (isInitialized) {
		return;
	}

	rad = THREE.Math.degToRad;
	deg = THREE.Math.radToDeg;
	lineMaterial = new THREE.LineMaterial({
		color: 0xffffff,
		vertexColors: THREE.VertexColors,
		linewidth: renderState.edgeWidth
	});

	faceMaterials = [
		new THREE.MeshBasicMaterial({
			vertexColors: THREE.FaceColors,
			side: THREE.DoubleSide,
			polygonOffset: true,
			polygonOffsetFactor: 1,
			polygonOffsetUnits: 1
		}),
		new THREE.MeshBasicMaterial({
			vertexColors: THREE.FaceColors,
			side: THREE.DoubleSide,
			opacity: 0.5,
			transparent: true,
			polygonOffset: true,
			polygonOffsetFactor: 1,
			polygonOffsetUnits: 1
		})
	];
	selectedFaceMaterial = new THREE.MeshBasicMaterial({
		vertexColors: THREE.FaceColors,
		opacity: 0.5,
		transparent: true,
		side: THREE.DoubleSide
	});
	arrowMaterial = new THREE.MeshBasicMaterial({
		color: 0xFF0000,
		side: THREE.DoubleSide
	});

	// Create a new 2D canvas to convert the full 3D canvas into a 2D canvas, and retrieve its image data
	measurementCanvas = document.createElement('canvas');

	// Create the Three.js renderer that will draw everything
	renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});

	const viewBox = renderState.zoom;
	camera = new THREE.OrthographicCamera(-viewBox, viewBox, viewBox, -viewBox, 0.01, 10000);
	camera.up = new THREE.Vector3(0, -1, 0);  // -1 because LDraw coordinate space has -y as UP
	camera.position.set(viewBox, -viewBox * 0.7, -viewBox);
	camera.lookAt(new THREE.Vector3());
	isInitialized = true;
}

function initScene(size) {

	const scene = new THREE.Scene();
	scene.add(new THREE.AmbientLight(0x404040));

	// These three calls must be made before addModelToScene(), to correctly project
	// points to screen (for conditional line rendering)
	renderer.setSize(size, size);
	camera.updateMatrixWorld();
	camera.updateProjectionMatrix();

	return scene;
}

function cleanup(scene) {
	renderer.renderLists.dispose();
	scene.traverse(node => {
		if (node instanceof THREE.Mesh) {
			if (node.geometry) {
				node.geometry.dispose();
			}
			if (Array.isArray(node.material)) {
				node.material.forEach(m => m.dispose());
			} else if (node.material) {
				node.material.dispose();
			}
		}
	});
}

// Render the specified scene in a size x size viewport, then crop it of all whitespace.
// Return a {width, height} object specifying the final tightly cropped rendered image size.
function render(scene, size, container, config) {

	config = config || {};

	renderer.render(scene, camera);

	measurementCanvas.width = measurementCanvas.height = size;
	const ctx = measurementCanvas.getContext('2d');
	ctx.drawImage(renderer.domElement, 0, 0);
	const data = ctx.getImageData(0, 0, size, size);

	const bounds = contextBoundingBox(data.data, size, size);
	if (!bounds) {
		return null;
	}

	container = (typeof container === 'string') ? document.getElementById(container) : container;
	if (config.resizeContainer) {
		container.width = bounds.w + 1;
		container.height = bounds.h + 1;
	}
	const ctx2 = container.getContext('2d');
	ctx2.drawImage(
		renderer.domElement,
		bounds.x, bounds.y,
		bounds.w + 1, bounds.h + 1,
		config.dx || 0, config.dy || 0,
		bounds.w + 1, bounds.h + 1
	);
	return {x: bounds.x, y: bounds.y, width: bounds.w, height: bounds.h};
}

/* eslint-disable no-multi-spaces, no-mixed-spaces-and-tabs, computed-property-spacing */
function LDMatrixToMatrix(m) {
	const matrix = new THREE.Matrix4();
	matrix.set(
		m[3], m[ 4], m[ 5], m[0],
		m[6], m[ 7], m[ 8], m[1],
		m[9], m[10], m[11], m[2],
		   0,     0,     0,    1
	);
	return matrix;
}

function MatrixToLDMatrix(m) {
	const a = m.elements;
	return [
		a[12], a[13], a[14],  // x, y, z
		a[ 0], a[ 4], a[ 8], a[1], a[5], a[9], a[2], a[6], a[10]  // a - i
	];
}
/* eslint-enable no-multi-spaces, no-mixed-spaces-and-tabs, computed-property-spacing */

function getPartGeometry(abstractPart, colorCode) {

	const geometry = {
		faces: new THREE.Geometry(),
		lines: new THREE.Geometry(),
		condlines: []
	};

	const alphaIdx = !LDParse.getColor(colorCode, 'alpha') ? 0 : 1;
	const colorObj = (colorCode == null) ? null : new THREE.Color(LDParse.getColor(colorCode));
	const lineColor = (colorCode == null) ? null : new THREE.Color(LDParse.getColor(colorCode, 'edge'));
	for (let i = 0; i < abstractPart.primitives.length; i++) {
		const primitive = abstractPart.primitives[i];
		const p = primitive.points;
		if (primitive.shape === 'line') {
			geometry.lines.vertices.push(new THREE.Vector3(p[0], p[1], p[2]));
			geometry.lines.vertices.push(new THREE.Vector3(p[3], p[4], p[5]));
			if (lineColor) {
				geometry.lines.colors.push(lineColor);
				geometry.lines.colors.push(lineColor);
			}
		} else if (primitive.shape === 'condline') {
			const cp = primitive.conditionalPoints;
			const condLine = new THREE.Geometry();
			condLine.vertices.push(new THREE.Vector3(p[0], p[1], p[2]));
			condLine.vertices.push(new THREE.Vector3(p[3], p[4], p[5]));
			if (lineColor) {
				condLine.colors.push(lineColor);
				condLine.colors.push(lineColor);
			}
			geometry.condlines.push({
				line: condLine,
				c1: new THREE.Vector3(cp[0], cp[1], cp[2]),
				c2: new THREE.Vector3(cp[3], cp[4], cp[5])
			});
		} else {

			let color = colorObj;
			if (LDParse.isValidColor(primitive.colorCode)) {
				color = new THREE.Color(LDParse.getColor(primitive.colorCode));
			}

			const vIdx = geometry.faces.vertices.length;
			geometry.faces.faces.push(new THREE.Face3(vIdx, vIdx + 1, vIdx + 2, null, color, alphaIdx));
			geometry.faces.vertices.push(new THREE.Vector3(p[0], p[1], p[2]));
			geometry.faces.vertices.push(new THREE.Vector3(p[3], p[4], p[5]));
			geometry.faces.vertices.push(new THREE.Vector3(p[6], p[7], p[8]));

			if (primitive.shape === 'quad') {
				geometry.faces.vertices.push(new THREE.Vector3(p[9], p[10], p[11]));
				const face2 = new THREE.Face3(vIdx, vIdx + 2, vIdx + 3, null, color, alphaIdx);
				geometry.faces.faces.push(face2);
			}
		}
	}

	for (let i = 0; i < abstractPart.parts.length; i++) {
		const part = abstractPart.parts[i];
		const matrix = LDMatrixToMatrix(part.matrix);
		const color = LDParse.isValidColor(part.colorCode) ? part.colorCode : colorCode;
		const subPartGeometry = getPartGeometry(api.partDictionary[part.filename], color);

		const faces = subPartGeometry.faces.clone().applyMatrix(matrix);
		geometry.faces.merge(faces);

		const lines = subPartGeometry.lines.clone().applyMatrix(matrix);
		geometry.lines.merge(lines);

		for (let l = 0; l < subPartGeometry.condlines.length; l++) {
			const condline = subPartGeometry.condlines[l];
			geometry.condlines.push({
				line: condline.line.clone().applyMatrix(matrix),
				c1: condline.c1.clone().applyMatrix4(matrix),
				c2: condline.c2.clone().applyMatrix4(matrix)
			});
		}
	}

	return geometry;
}

const arrowDimensions = {
	head: {
		length: 28,
		width: 7,
		insetDepth: 4
	},
	body: {
		width: 1.25
	}
};

// Arrow geometry has base at (0, 0, 0), pointing straight down along Y, facing forward along Z
function getArrowGeometry(length = 60) {
	const head = arrowDimensions.head, body = arrowDimensions.body;
	const geom = new THREE.Geometry();
	geom.vertices.push(new THREE.Vector3(0, length, 0));  // 0
	geom.vertices.push(new THREE.Vector3(-head.width, length - head.length, 0));  // 1
	geom.vertices.push(new THREE.Vector3(-body.width, length - head.length + head.insetDepth, 0));  // 2
	geom.vertices.push(new THREE.Vector3(body.width, length - head.length + head.insetDepth, 0));  // 3
	geom.vertices.push(new THREE.Vector3(head.width, length - head.length, 0));  // 4
	geom.vertices.push(new THREE.Vector3(body.width, 0, 0));  // 5
	geom.vertices.push(new THREE.Vector3(-body.width, 0, 0));  // 6
	geom.faces.push(new THREE.Face3(0, 1, 2));
	geom.faces.push(new THREE.Face3(0, 2, 3));
	geom.faces.push(new THREE.Face3(0, 3, 4));
	geom.faces.push(new THREE.Face3(2, 3, 5));
	geom.faces.push(new THREE.Face3(2, 5, 6));
	return geom;
}

function project(vec, camera, size) {
	vec = vec.clone();
	vec.project(camera);
	vec.x = (vec.x * size) + size;
	vec.y = -(vec.y * size) + size;
	vec.z = 0;
	return vec;
}

function lineSide(p, l1, l2) {
	const res = ((p.x - l1.x) * (l2.y - l1.y)) - ((p.y - l1.y) * (l2.x - l1.x));
	return (res > 0) ? 1 : -1;
}

function getPartDisplacement({direction, partDistance = 60}) {
	switch (direction) {
		case 'left':
			return {x: -partDistance, y: 0, z: 0};
		case 'right':
			return {x: partDistance, y: 0, z: 0};
		case 'forward':
			return {x: 0, y: 0, z: -partDistance};
		case 'backward':
			return {x: 0, y: 0, z: partDistance};
		case 'down':
			return {x: 0, y: partDistance, z: 0};
		case 'up':
		default:
			return {x: 0, y: -partDistance, z: 0};
	}
}

function getArrowInitialPosition(partMesh) {
	const partBox = new THREE.Box3().setFromObject(partMesh);
	const center = partBox.getCenter();
	return new THREE.Matrix4().makeTranslation(center.x, center.y, center.z);
}

function getArrowOffsetPosition(partBox, {direction, arrowOffset = 0}) {

	const max = partBox.max, min = partBox.min;
	let x = 0, y = 0, z = 0;

	switch (direction) {
		case 'left':
			x = ((max.x - min.x) / 2) + arrowOffset;
			break;
		case 'right':
			x = -((max.x - min.x) / 2) - arrowOffset;
			break;
		case 'forward':
			z = ((max.z - min.z) / 2) + arrowOffset;
			break;
		case 'backward':
			z = -((max.z - min.z) / 2) - arrowOffset;
			break;
		case 'down':
			y = -((max.y - min.y) / 2) - arrowOffset;
			break;
		case 'up':
		default:
			// -6 because arrow almost always lands on top of a stud, and a stud is about 6 units tall
			y = ((max.y - min.y) / 2) + arrowOffset - 6;
			break;
	}
	return new THREE.Matrix4().makeTranslation(x, y, z);
}

function getArrowRotation({direction, arrowRotation = 0}) {
	let x = 0, y = 0, z = 0;
	switch (direction) {
		case 'left':
			z = -90;
			x = -45 + arrowRotation;
			break;
		case 'right':
			z = 90;
			x = -45 + arrowRotation;
			break;
		case 'forward':
			x = 90;
			y = 45 + arrowRotation;
			break;
		case 'backward':
			x = -90;
			y = -45 + arrowRotation;
			break;
		case 'down':
			x = 180;
			y = 45 + arrowRotation;
			break;
		case 'up':
		default:
			y = -45 + arrowRotation;
			break;
	}
	const rot = new THREE.Euler(rad(x), rad(y), rad(z), 'XYZ');
	return new THREE.Matrix4().makeRotationFromEuler(rot);
}

function getArrowMesh(partMesh, partBox, partRotation, displacement) {

	const arrowGeometry = getArrowGeometry(displacement.arrowLength);
	const arrowMesh = new THREE.Mesh(arrowGeometry, arrowMaterial);
	const arrowMatrix = new THREE.Matrix4();
	arrowMatrix.multiply(getArrowInitialPosition(partMesh));
	if (partRotation) {
		arrowMatrix.multiply(partRotation);
	}
	arrowMatrix.multiply(getArrowOffsetPosition(partBox, displacement));
	arrowMatrix.multiply(getArrowRotation(displacement));
	arrowMesh.applyMatrix(arrowMatrix);

	return arrowMesh;
}

function addModelToScene(scene, model, partIDList, config) {

	const size = config.size / 2;
	const selectedPartIDs = config.selectedPartIDs || [];
	const displacedParts = {};
	(config.displacedParts || []).forEach(p => {
		displacedParts[p.partID] = p;
	});

	for (let i = 0; i < partIDList.length; i++) {
		const part = model.parts[partIDList[i]];
		const abstractPart = api.partDictionary[part.filename];
		const drawSelected = config.includeSelection && selectedPartIDs.includes(partIDList[i]);
		const displacement = displacedParts[partIDList[i]];

		const matrix = LDMatrixToMatrix(part.matrix);
		const color = LDParse.isValidColor(part.colorCode) ? part.colorCode : null;
		const partGeometry = getPartGeometry(abstractPart, color);

		if (displacement) {
			const {x, y, z} = getPartDisplacement(displacement);
			matrix.premultiply(new THREE.Matrix4().makeTranslation(x, y, z));
		}

		let partRotation;
		if (config.rotation) {
			const {x, y, z} = config.rotation;
			partRotation = new THREE.Euler(rad(x), rad(y), rad(z), 'XYZ');
			partRotation = new THREE.Matrix4().makeRotationFromEuler(partRotation);
			matrix.premultiply(partRotation);
		}

		const faceMat = drawSelected ? selectedFaceMaterial : faceMaterials;
		const mesh = new THREE.Mesh(partGeometry.faces, faceMat);

		let meshBox;
		if (displacement) {
			// Store copy of untransformed part bounding box, for displacement arrow positioning later
			meshBox = new THREE.Box3().setFromObject(mesh);
		}

		mesh.applyMatrix(matrix);
		scene.add(mesh);

		const lineGeom = new THREE.LineSegmentsGeometry();
		const points = [], colors = [];
		for (let i = 0; i < partGeometry.lines.vertices.length; i++) {
			const v = partGeometry.lines.vertices[i];
			const c = partGeometry.lines.colors[i];
			points.push(v.x, v.y, v.z);
			colors.push(c.r, c.g, c.b);
		}
		lineGeom.setPositions(points);
		lineGeom.setColors(colors);

		const line = new THREE.LineSegments2(lineGeom, lineMaterial);
		line.applyMatrix(matrix);
		scene.add(line);

		if (displacement) {
			if (config.displacementArrowColor) {
				arrowMaterial.color.set(config.displacementArrowColor);
			}
			const arrowMesh = getArrowMesh(mesh, meshBox, partRotation, displacement);
			scene.add(arrowMesh);
		}

		if (drawSelected) {
			const box = new THREE.Box3().setFromObject(mesh);
			const boxMesh = new THREE.Box3Helper(box, selectedLineColor);
			scene.add(boxMesh);
		}

		for (let l = 0; l < partGeometry.condlines.length; l++) {

			const condline = partGeometry.condlines[l];
			const cline = condline.line.clone().applyMatrix(matrix);
			const l1 = project(cline.vertices[0], camera, size);
			const l2 = project(cline.vertices[1], camera, size);

			const c1 = project(condline.c1.clone().applyMatrix4(matrix), camera, size);
			const c2 = project(condline.c2.clone().applyMatrix4(matrix), camera, size);

			if (lineSide(c1, l1, l2) === lineSide(c2, l1, l2)) {
				const condLineGeom = new THREE.LineSegmentsGeometry();
				const v = cline.vertices;
				condLineGeom.setPositions([v[0].x, v[0].y, v[0].z, v[1].x, v[1].y, v[1].z]);
				const c = cline.colors;
				condLineGeom.setColors([c[0].r, c[0].g, c[0].b, c[1].r, c[1].g, c[1].b]);
				scene.add(new THREE.LineSegments2(condLineGeom, lineMaterial));
			}
		}
	}
}

function addPartToScene(scene, colorCode, filename, config) {

	/*
	const mesh = new THREE.Mesh(partGeometry.faces.clone(), faceMaterial);
	if (config && config.rotation) {
		mesh.rotation.x = config.rotation.x * Math.PI / 180;
		mesh.rotation.y = config.rotation.y * Math.PI / 180;
		mesh.rotation.z = config.rotation.z * Math.PI / 180;
	}
	scene.add(mesh);
	*/

	const part = {
		colorCode: colorCode,
		filename: filename,
		matrix: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]
	};

	const model = {
		filename: part.filename,
		name: part.filename,
		parts: [part], primitives: []
	};

	return addModelToScene(scene, model, [0], config);
}

export default api;
