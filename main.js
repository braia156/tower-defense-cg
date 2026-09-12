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

        // 1. Dados na RAM (3 vértices com x, y, z)
        const posicoes = new Float32Array([
            0.0,  0.5, 0.0, 
            -0.5, -0.5, 0.0, 
            0.5, -0.5, 0.0  
        ]);

        // 2. VBO: Abastecendo a GPU
        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, posicoes, gl.STATIC_DRAW); //

        // 3. VAO: Registrando a interpretação
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao); //[cite: 2]

        // Descobre onde está a entrada 'posicao' no Vertex Shader
        const localPosicao = gl.getAttribLocation(programa, "posicao");

        // Ensina a ler: 3 componentes por vértice, tipo FLOAT, sem normalizar, stride 0, offset 0
        gl.vertexAttribPointer(localPosicao, 3, gl.FLOAT, false, 0, 0); //[cite: 2]
        gl.enableVertexAttribArray(localPosicao); //[cite: 2]

        // 4. Ordem de desenho (Draw Call)
        gl.drawArrays(gl.TRIANGLES, 0, 3); //[cite: 2]

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