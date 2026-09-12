const canvas = document.getElementById('gameCanvas');
const gl = canvas.getContext('webgl2');

if (!gl) {
    throw new Error('WebGL 2 indisponível');
}

gl.clearColor(0.1, 0.1, 0.1, 1.0);
gl.clear(gl.COLOR_BUFFER_BIT);