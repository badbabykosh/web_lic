/* global glMatrix: false */
/* eslint-disable no-alert */

import faceShaderSource from './faceShader.glsl';
import lineShaderSource from './lineShader.glsl';
import condLineShaderSource from './condLineShader.glsl';
import fragmentShaderSource from './fragmentShader.glsl';
import twgl from './twgl';

import LDParse from '../LDParse';

let squareRotation = 1.0;

function drawScene(gl, programs, objectsToDraw, deltaTime) {

	gl.clearColor(0, 0, 0, 0);
	gl.clearDepth(1.0);
	// gl.enable(gl.CULL_FACE);

	gl.enable(gl.BLEND);
	gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

	gl.enable(gl.DEPTH_TEST);
	gl.depthFunc(gl.LEQUAL);

	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

	const thickness = 0.0035;
	const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
	const projectionMatrix = glMatrix.mat4.create();
	// const w = 530;  // xwing
	const w = 330;
	// out, left, right, bottom, top, near, far
	glMatrix.mat4.ortho(projectionMatrix, -w, w, w / aspect, -w / aspect, w, -w);

	const viewMatrix = glMatrix.mat4.create();
	glMatrix.mat4.translate(viewMatrix, viewMatrix, [-180, 0, 0]);
	glMatrix.mat4.rotate(viewMatrix, viewMatrix, 0.75 * squareRotation, [1, 0, 0]);
	glMatrix.mat4.rotate(viewMatrix, viewMatrix, 0.75 * squareRotation, [0, 1, 0]);

	glMatrix.mat4.multiply(projectionMatrix, projectionMatrix, viewMatrix);

	// Draw opaque faces first
	gl.enable(gl.POLYGON_OFFSET_FILL);
	gl.polygonOffset(1, 1);
	gl.useProgram(programs.faces.program);
	for (let i = 0; i < objectsToDraw.faces.length; i++) {
		const object = objectsToDraw.faces[i];
		twgl.setBuffersAndAttributes(gl, programs.faces, object.buffers);
		programs.faces.uniformSetters.projection(projectionMatrix);
		twgl.setUniforms(programs.faces, object.uniforms);
		gl.drawElements(gl.TRIANGLES, object.buffers.numElements, gl.UNSIGNED_SHORT, 0);
	}

	gl.disable(gl.POLYGON_OFFSET_FILL);
	gl.useProgram(programs.lines.program);
	for (let i = 0; i < objectsToDraw.lines.length; i++) {
		const object = objectsToDraw.lines[i];
		twgl.setBuffersAndAttributes(gl, programs.lines, object.buffers);
		programs.lines.uniformSetters.projection(projectionMatrix);
		programs.lines.uniformSetters.aspect(aspect);
		programs.lines.uniformSetters.thickness(thickness);
		twgl.setUniforms(programs.lines, object.uniforms);
		gl.drawElements(gl.TRIANGLES, object.buffers.numElements, gl.UNSIGNED_SHORT, 0);
	}

	gl.useProgram(programs.condLines.program);
	for (let i = 0; i < objectsToDraw.condLines.length; i++) {
		const object = objectsToDraw.condLines[i];
		twgl.setBuffersAndAttributes(gl, programs.condLines, object.buffers);
		programs.condLines.uniformSetters.projection(projectionMatrix);
		programs.condLines.uniformSetters.aspect(aspect);
		programs.condLines.uniformSetters.thickness(thickness);
		twgl.setUniforms(programs.condLines, object.uniforms);
		gl.drawElements(gl.TRIANGLES, object.buffers.numElements, gl.UNSIGNED_SHORT, 0);
	}

	// Draw partially transparent faces last
	gl.useProgram(programs.faces.program);
	for (let i = 0; i < objectsToDraw.alphaFaces.length; i++) {
		const object = objectsToDraw.alphaFaces[i];
		twgl.setBuffersAndAttributes(gl, programs.faces, object.buffers);
		programs.faces.uniformSetters.projection(projectionMatrix);
		twgl.setUniforms(programs.faces, object.uniforms);
		gl.drawElements(gl.TRIANGLES, object.buffers.numElements, gl.UNSIGNED_SHORT, 0);
	}

	squareRotation += deltaTime;
}

const partBufferCache = {};

function addObject(objectsToDraw, objectType, buffers, fn, modelView, color) {
	if (buffers) {
		partBufferCache[fn][objectType] = buffers;
		objectsToDraw[objectType].push({
			buffers,
			uniforms: {modelView, color}
		});
	}
}

function addLine(lineData, p, cp) {
	const idx = lineData.indices.lastIndex;
	lineData.position.data.push(p[0], p[1], p[2], p[0], p[1], p[2], p[3], p[4], p[5], p[3], p[4], p[5]);
	lineData.next.data.push(p[3], p[4], p[5], p[3], p[4], p[5], p[0], p[1], p[2], p[0], p[1], p[2]);
	lineData.indices.data.push(
		idx + 2, idx + 1, idx,
		idx + 3, idx + 1, idx + 2
	);
	lineData.direction.data.push(-1, 1, -1, 1);
	lineData.order.data.push(0, 0, 1, 1);
	if (cp != null) {
		lineData.condPointA.data.push(
			cp[0], cp[1], cp[2], cp[0], cp[1], cp[2], cp[0], cp[1], cp[2], cp[0], cp[1], cp[2]
		);
		lineData.condPointB.data.push(
			cp[3], cp[4], cp[5], cp[3], cp[4], cp[5], cp[3], cp[4], cp[5], cp[3], cp[4], cp[5]
		);
	}
	lineData.indices.lastIndex += 4;
}

function ldPartToDrawObj(gl, part, modelView, programs, colorCode) {

	const rgba = LDParse.getColor(colorCode, 'rgba');
	const edgeRgba = LDParse.getColor(colorCode, 'edgeRgba');
	let faceBuffer, lineBuffer, condLineBuffer;

	if (partBufferCache[part.filename]) {
		faceBuffer = partBufferCache[part.filename].faces;
		lineBuffer = partBufferCache[part.filename].lines;
		condLineBuffer = partBufferCache[part.filename].condLines;
	} else if (part.primitives.length) {

		const faceData = {
			position: {data: [], numComponents: 3},
			indices: {data: [], numComponents: 3, lastIndex: 0}
		};
		const lineData = {
			position: {data: [], numComponents: 3},
			next: {data: [], numComponents: 3},
			direction: {data: [], numComponents: 1},
			order: {data: [], numComponents: 1},
			indices: {data: [], numComponents: 3, lastIndex: 0}
		};
		const condLineData = {
			position: {data: [], numComponents: 3},
			next: {data: [], numComponents: 3},
			direction: {data: [], numComponents: 1},
			order: {data: [], numComponents: 1},
			condPointA: {data: [], numComponents: 3},
			condPointB: {data: [], numComponents: 3},
			indices: {data: [], numComponents: 3, lastIndex: 0}
		};

		for (let i = 0; i < part.primitives.length; i++) {
			const primitive = part.primitives[i];
			const p = primitive.points;
			if (primitive.shape === 'triangle' || primitive.shape === 'quad') {
				faceData.position.data.push(...p);
				const lastIndex = faceData.indices.lastIndex;
				faceData.indices.data.push(lastIndex, lastIndex + 1, lastIndex + 2);
				if (primitive.shape === 'triangle') {
					faceData.indices.lastIndex += 3;
				} else {
					faceData.indices.data.push(lastIndex, lastIndex + 2, lastIndex + 3);
					faceData.indices.lastIndex += 4;
				}
			} else if (primitive.shape === 'line') {
				addLine(lineData, p);
			} else if (primitive.shape === 'condline') {
				addLine(condLineData, p, primitive.conditionalPoints);
			}
		}

		partBufferCache[part.filename] = {};
		if (faceData.position.data.length) {
			faceBuffer = twgl.createBufferInfoFromArrays(gl, faceData);
		}
		if (lineData.position.data.length) {
			lineBuffer = twgl.createBufferInfoFromArrays(gl, lineData);
		}
		if (condLineData.position.data.length) {
			condLineBuffer = twgl.createBufferInfoFromArrays(gl, condLineData);
		}
	}

	const objectsToDraw = {faces: [], lines: [], condLines: [], alphaFaces: []};

	if (rgba && rgba[3] === 1) {
		addObject(objectsToDraw, 'faces', faceBuffer, part.filename, modelView, rgba);
	}

	addObject(objectsToDraw, 'lines', lineBuffer, part.filename, modelView, edgeRgba);
	addObject(objectsToDraw, 'condLines', condLineBuffer, part.filename, modelView, edgeRgba);

	if (rgba && rgba[3] < 1) {
		addObject(objectsToDraw, 'alphaFaces', faceBuffer, part.filename, modelView, rgba);
	}

	for (let i = 0; i < part.parts.length; i++) {
		const subPart = part.parts[i];
		const abstractPart = LDParse.partDictionary[subPart.filename];
		const newMat = LDMatrixToMatrix(subPart.matrix);
		glMatrix.mat4.multiply(newMat, modelView, newMat);
		const newColorCode = isValidColorCode(subPart.colorCode) ? subPart.colorCode : colorCode;
		const partObject = ldPartToDrawObj(gl, abstractPart, newMat, programs, newColorCode);
		objectsToDraw.faces.push(...partObject.faces);
		objectsToDraw.lines.push(...partObject.lines);
		objectsToDraw.condLines.push(...partObject.condLines);
		objectsToDraw.alphaFaces.push(...partObject.alphaFaces);
	}

	return objectsToDraw;
}

function isValidColorCode(colorCode) {
	return typeof colorCode === 'number' && colorCode >= 0;
}

/* eslint-disable computed-property-spacing */
function LDMatrixToMatrix(m) {
	return [
		m[3], m[6], m[ 9], 0,
		m[4], m[7], m[10], 0,
		m[5], m[8], m[11], 0,
		m[0], m[1], m[ 2], 1
	];
}
/* eslint-enable computed-property-spacing */

const animate = false;

function renderLDrawPart(gl, programs, part) {

	let then = 0;
	const baseMatrix = glMatrix.mat4.create();
	const objectsToDraw = ldPartToDrawObj(gl, part, baseMatrix, programs);

	// Draw the scene repeatedly
	function render(now) {

		now *= 0.001;  // convert to seconds
		const deltaTime = now - then;
		then = now;
		drawScene(gl, programs, objectsToDraw, deltaTime);
		document.getElementById('fps').innerText = (1 / deltaTime).toFixed(3) + ' fps';
		requestAnimationFrame(render);
	}

	if (animate) {
		requestAnimationFrame(render);
	} else {
		drawScene(gl, programs, objectsToDraw, 0);
	}
}

export default function init(canvas) {

	window.draw = function() {
	};

	const gl = canvas.getContext('webgl', {
		antialias: true,
		alpha: true
	});
	const programs = {
		faces: twgl.createProgramInfo(gl, [faceShaderSource, fragmentShaderSource]),
		lines: twgl.createProgramInfo(gl, [lineShaderSource, fragmentShaderSource]),
		condLines: twgl.createProgramInfo(gl, [condLineShaderSource, fragmentShaderSource])
	};

	LDParse.loadLDConfig();

	// const url = './static/models/20015 - Alligator.mpd';
	const url = './static/models/7140 - x-wing fighter.mpd';
	LDParse.loadRemotePart(url)
		.then(function() {
			// const part = LDParse.partDictionary['20015 - Alligator.mpd'];
			const part = LDParse.partDictionary['7140 - Main Model.ldr'];

			renderLDrawPart(gl, programs, part);
		});
}
