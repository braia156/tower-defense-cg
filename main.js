const canvas = document.getElementById('gameCanvas');
const gl = canvas.getContext('webgl2');

if (!gl) throw new Error('WebGL 2 indisponível');

function criarMatrizOrtografica(esquerda, direita, baixo, cima, perto, longe) {
    return new Float32Array([
        2 / (direita - esquerda), 0, 0, 0,
        0, 2 / (cima - baixo), 0, 0,
        0, 0, -2 / (longe - perto), 0,
        -(direita + esquerda) / (direita - esquerda), -(cima + baixo) / (cima - baixo), -(longe + perto) / (longe - perto), 1
    ]);
}

function criarMatrizModelo(tx, ty, sx, sy) {
    return new Float32Array([
        sx, 0, 0, 0,
        0, sy, 0, 0,
        0, 0, 1, 0,
        tx, ty, 0, 1
    ]);
}

async function carregarTexto(caminho) {
    const resposta = await fetch(caminho);
    if (!resposta.ok) throw new Error(`Falha no shader: ${caminho}`);
    return resposta.text();
}

async function carregarTextura(gl, url) {
    const imagem = new Image();
    imagem.src = url;
    await imagem.decode();

    const textura = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, textura);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imagem);
    
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    return textura;
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

async function iniciar() {
    try {
        const [fonteVertex, fonteFragment, texturaTorre] = await Promise.all([
            carregarTexto('shaders/vertex.glsl'),
            carregarTexto('shaders/fragment.glsl'),
            carregarTextura(gl, 'assets/torre.png')
        ]);

        const vertexShader = criarShader(gl, gl.VERTEX_SHADER, fonteVertex);
        const fragmentShader = criarShader(gl, gl.FRAGMENT_SHADER, fonteFragment);
        const programa = criarPrograma(gl, vertexShader, fragmentShader);

        gl.useProgram(programa);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        const posicoes = new Float32Array([
             0.0, 1.0, 0.0,   0.0, 1.0, 
             0.0, 0.0, 0.0,   0.0, 0.0, 
             1.0, 0.0, 0.0,   1.0, 0.0, 
             1.0, 1.0, 0.0,   1.0, 1.0  
        ]);

        const indices = new Uint16Array([
            0, 1, 2,
            0, 2, 3
        ]);

        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, posicoes, gl.STATIC_DRAW);

        const ebo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

        const tamanhoFloat = 4;
        const stride = 5 * tamanhoFloat;

        const localPosicao = gl.getAttribLocation(programa, "posicao");
        gl.vertexAttribPointer(localPosicao, 3, gl.FLOAT, false, stride, 0);
        gl.enableVertexAttribArray(localPosicao);

        const localUv = gl.getAttribLocation(programa, "uv");
        gl.vertexAttribPointer(localUv, 2, gl.FLOAT, false, stride, 3 * tamanhoFloat);
        gl.enableVertexAttribArray(localUv);

        const matrizProjecao = criarMatrizOrtografica(0, canvas.width, canvas.height, 0, -1, 1);
        const localMatrizProjecao = gl.getUniformLocation(programa, "matrizProjecao");
        gl.uniformMatrix4fv(localMatrizProjecao, false, matrizProjecao);

        const localMatrizModelo = gl.getUniformLocation(programa, "matrizModelo");

        const torreLargura = 128;
        const torreAltura = 128;
        const torreX = (canvas.width / 2) - (torreLargura / 2);
        const torreY = (canvas.height / 2) - (torreAltura / 2);
        
        const matrizModelo = criarMatrizModelo(torreX, torreY, torreLargura, torreAltura);

        let tempoAnterior;

        function desenharQuadro(tempoAtual) {
            const delta = tempoAnterior === undefined ? 0 : (tempoAtual - tempoAnterior) / 1000;
            tempoAnterior = tempoAtual;

            gl.clearColor(0.2, 0.3, 0.3, 1.0);
            gl.clear(gl.COLOR_BUFFER_BIT);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texturaTorre);
            const localTextura = gl.getUniformLocation(programa, "texturaAtiva");
            gl.uniform1i(localTextura, 0);

            gl.uniformMatrix4fv(localMatrizModelo, false, matrizModelo);

            gl.bindVertexArray(vao);
            gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

            requestAnimationFrame(desenharQuadro);
        }

        requestAnimationFrame(desenharQuadro);

    } catch (erro) {
        console.error("Deu erro:", erro);
    }
}

iniciar();