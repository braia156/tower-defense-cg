const canvas = document.getElementById('gameCanvas');
const gl = canvas.getContext('webgl2');

if (!gl) throw new Error('WebGL 2 indisponível');

gl.clearColor(0.1, 0.1, 0.1, 1.0);
gl.clear(gl.COLOR_BUFFER_BIT);

async function carregarTexto(caminho) {
    const resposta = await fetch(caminho);
    if (!resposta.ok) throw new Error(`Falha no shader: ${caminho}`);
    return resposta.text();
}

async function iniciar() {
    try {
       const [fonteVertex, fonteFragment] = await Promise.all([
            carregarTexto('shaders/vertex.glsl'),
            carregarTexto('shaders/fragment.glsl')
        ]);

        const vertexShader = criarShader(gl, gl.VERTEX_SHADER, fonteVertex);
        const fragmentShader = criarShader(gl, gl.FRAGMENT_SHADER, fonteFragment);
        const programa = criarPrograma(gl, vertexShader, fragmentShader);

        gl.useProgram(programa);
        console.log("Programa linkado e ativo na GPU!");
        
    } catch (erro) {
        console.error("Deu erro:", erro);
    }
}

function criarShader(gl, tipo, fonte) {
    const shader = gl.createShader(tipo);
    gl.shaderSource(shader, fonte);
    gl.compileShader(shader);
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`Erro ao compilar shader: ${info}`);
    }
    return shader;
}

function criarPrograma(gl, vertexShader, fragmentShader) {
    const programa = gl.createProgram();
    gl.attachShader(programa, vertexShader);
    gl.attachShader(programa, fragmentShader);
    gl.linkProgram(programa);
    
    if (!gl.getProgramParameter(programa, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(programa);
        gl.deleteProgram(programa);
        throw new Error(`Erro ao linkar programa: ${info}`);
    }
    return programa;
}

iniciar();