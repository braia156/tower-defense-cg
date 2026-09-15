const canvas = document.getElementById('gameCanvas');
const gl = canvas.getContext('webgl2');

if (!gl) throw new Error('WebGL 2 indisponível');

const uiMuro = document.getElementById('uiMuro');
const uiVida = document.getElementById('uiVida');
const uiPontos = document.getElementById('uiPontos');
const telaGameOver = document.getElementById('telaGameOver');
const telaPause = document.getElementById('telaPause');
const telaMenu = document.getElementById('telaMenu');
const btnReiniciar = document.getElementById('btnReiniciar');
const btnIniciar = document.getElementById('btnIniciar');

let jogoAtivo = false;
let jogoPausado = false;
let multiplicadorDificuldade = 1.0;
let vidaMuro = 100;
let vidaTorre = 100;
let pontuacao = 0;
let inimigos = [];
let projetis = [];

function atualizarHUD() {
    uiMuro.innerText = vidaMuro > 0 ? vidaMuro : 0;
    uiVida.innerText = vidaTorre;
    uiPontos.innerText = pontuacao;
}

function criarMatrizOrtografica(esquerda, direita, baixo, cima, perto, longe) {
    return new Float32Array([
        2 / (direita - esquerda), 0, 0, 0,
        0, 2 / (cima - baixo), 0, 0,
        0, 0, -2 / (longe - perto), 0,
        -(direita + esquerda) / (direita - esquerda), -(cima + baixo) / (cima - baixo), -(longe + perto) / (longe - perto), 1
    ]);
}

function criarMatrizModelo(tx, ty, sx, sy, flipX = false) {
    const escalaX = flipX ? -sx : sx;
    const posX = flipX ? tx + sx : tx;
    
    return new Float32Array([
        escalaX, 0, 0, 0,
        0, sy, 0, 0,
        0, 0, 1, 0,
        posX, ty, 0, 1
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
        throw new Error(`Erro: ${gl.getShaderInfoLog(shader)}`);
    }
    return shader;
}

function criarPrograma(gl, vertexShader, fragmentShader) {
    const programa = gl.createProgram();
    gl.attachShader(programa, vertexShader);
    gl.attachShader(programa, fragmentShader);
    gl.linkProgram(programa);
    if (!gl.getProgramParameter(programa, gl.LINK_STATUS)) {
        throw new Error(`Erro: ${gl.getProgramInfoLog(programa)}`);
    }
    return programa;
}

async function iniciar() {
    try {
        const [fonteVertex, fonteFragment, texturaTorre, texturaInimigo, texturaProjetil, texturaMuro] = await Promise.all([
            carregarTexto('shaders/vertex.glsl'),
            carregarTexto('shaders/fragment.glsl'),
            carregarTextura(gl, 'assets/torre.png'),
            carregarTextura(gl, 'assets/inimigo.png'),
            carregarTextura(gl, 'assets/projetil.png'),
            carregarTextura(gl, 'assets/muro.png') 
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

        const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);

        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, posicoes, gl.STATIC_DRAW);

        const ebo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

        const stride = 5 * 4;
        const localPosicao = gl.getAttribLocation(programa, "posicao");
        gl.vertexAttribPointer(localPosicao, 3, gl.FLOAT, false, stride, 0);
        gl.enableVertexAttribArray(localPosicao);

        const localUv = gl.getAttribLocation(programa, "uv");
        gl.vertexAttribPointer(localUv, 2, gl.FLOAT, false, stride, 3 * 4);
        gl.enableVertexAttribArray(localUv);

        const matrizProjecao = criarMatrizOrtografica(0, canvas.width, canvas.height, 0, -1, 1);
        const localMatrizProjecao = gl.getUniformLocation(programa, "matrizProjecao");
        gl.uniformMatrix4fv(localMatrizProjecao, false, matrizProjecao);

        const localMatrizModelo = gl.getUniformLocation(programa, "matrizModelo");
        const localTextura = gl.getUniformLocation(programa, "texturaAtiva");

        const torreLargura = 128;
        const torreAltura = 128;
        const torreX = 20;
        const torreY = canvas.height - torreAltura - 20;
        const matrizModeloTorre = criarMatrizModelo(torreX, torreY, torreLargura, torreAltura);

        const muroLargura = 64;
        const muroX = 180;
        const blocosMuro = 3; 

        const inimigoTamanho = 64;
        const velocidade = 100; 
        const projetilTamanho = 16;
        const velocidadeProjetil = 400;
        
        let tempoUltimoSpawn = 0;
        let tempoAnterior;

        btnIniciar.addEventListener('click', () => {
            telaMenu.style.display = 'none';
            jogoAtivo = true;
            tempoAnterior = performance.now();
            requestAnimationFrame(desenharQuadro);
        });

        window.addEventListener('keydown', (e) => {
            if ((e.key === 'p' || e.key === 'P' || e.key === 'Escape') && jogoAtivo) {
                jogoPausado = !jogoPausado;
                telaPause.style.display = jogoPausado ? 'flex' : 'none';
                
                if (!jogoPausado) {
                    tempoAnterior = performance.now();
                    requestAnimationFrame(desenharQuadro);
                }
            }
        });

        canvas.addEventListener('mousedown', (e) => {
            if (!jogoAtivo || jogoPausado) return;
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            for (let i = inimigos.length - 1; i >= 0; i--) {
                const ini = inimigos[i];
                if (mouseX >= ini.x && mouseX <= ini.x + inimigoTamanho &&
                    mouseY >= ini.y && mouseY <= ini.y + inimigoTamanho) {
                    
                    projetis.push({
                        x: torreX + (torreLargura / 2) - (projetilTamanho / 2),
                        y: torreY + (torreAltura / 2) - (projetilTamanho / 2),
                        alvo: ini
                    });
                    break; 
                }
            }
        });

        btnReiniciar.addEventListener('click', () => {
            vidaMuro = 100;
            vidaTorre = 100;
            pontuacao = 0;
            inimigos = [];
            projetis = [];
            jogoAtivo = true;
            jogoPausado = false;
            multiplicadorDificuldade = 1.0;
            telaGameOver.style.display = 'none';
            telaPause.style.display = 'none';
            atualizarHUD();
            tempoAnterior = performance.now();
            requestAnimationFrame(desenharQuadro);
        });

        function desenharQuadro(tempoAtual) {
            if (!jogoAtivo || jogoPausado) return;

            const delta = tempoAnterior === undefined ? 0 : (tempoAtual - tempoAnterior) / 1000;
            tempoAnterior = tempoAtual;

            multiplicadorDificuldade = 1.0 + (tempoAtual / 120000);

            gl.clearColor(0.2, 0.3, 0.3, 1.0);
            gl.clear(gl.COLOR_BUFFER_BIT);

            if (tempoAtual - tempoUltimoSpawn > (1000 / multiplicadorDificuldade)) {
                inimigos.push({
                    x: canvas.width,
                    y: Math.random() * (canvas.height - inimigoTamanho),
                    flipX: false,
                    vida: 3 + Math.floor(pontuacao / 200), 
                    ultimoAtaque: 0
                });
                tempoUltimoSpawn = tempoAtual;
            }

            for (let i = projetis.length - 1; i >= 0; i--) {
                const p = projetis[i];
                
                if (!inimigos.includes(p.alvo)) {
                    projetis.splice(i, 1);
                    continue;
                }

                const dx = (p.alvo.x + inimigoTamanho / 2) - (p.x + projetilTamanho / 2);
                const dy = (p.alvo.y + inimigoTamanho / 2) - (p.y + projetilTamanho / 2);
                const distancia = Math.sqrt(dx * dx + dy * dy);

                if (distancia < 20) {
                    const dano = 1 + Math.floor(pontuacao / 100);
                    const raioArea = pontuacao >= 50 ? 80 + Math.floor(pontuacao / 50) * 10 : 0;
                    
                    if (raioArea > 0) {
                        inimigos.forEach(ini => {
                            const ex = (ini.x + inimigoTamanho / 2) - (p.x + projetilTamanho / 2);
                            const ey = (ini.y + inimigoTamanho / 2) - (p.y + projetilTamanho / 2);
                            if (Math.sqrt(ex * ex + ey * ey) <= raioArea) {
                                ini.vida -= dano;
                            }
                        });
                    } else {
                        p.alvo.vida -= dano;
                    }
                    
                    projetis.splice(i, 1);
                } else {
                    p.x += (dx / distancia) * velocidadeProjetil * delta;
                    p.y += (dy / distancia) * velocidadeProjetil * delta;
                }
            }

            for (let i = inimigos.length - 1; i >= 0; i--) {
                if (inimigos[i].vida <= 0) {
                    pontuacao += 10;
                    atualizarHUD();
                    inimigos.splice(i, 1);
                    continue;
                }

                const inimigo = inimigos[i];
                const dx = (torreX + torreLargura / 2) - (inimigo.x + inimigoTamanho / 2);
                const dy = (torreY + torreAltura / 2) - (inimigo.y + inimigoTamanho / 2);
                const distanciaTorre = Math.sqrt(dx * dx + dy * dy);

                inimigo.flipX = dx < 0;

                const colidindoMuro = vidaMuro > 0 && inimigo.x <= muroX + muroLargura;

                if (colidindoMuro) {
                    if (tempoAtual - inimigo.ultimoAtaque > 1500) {
                        vidaMuro -= 5;
                        inimigo.ultimoAtaque = tempoAtual;
                        atualizarHUD();
                    }
                } else if (distanciaTorre > 65) {
                    inimigo.x += (dx / distanciaTorre) * (velocidade * multiplicadorDificuldade) * delta;
                    inimigo.y += (dy / distanciaTorre) * (velocidade * multiplicadorDificuldade) * delta;
                } else {
                    if (tempoAtual - inimigo.ultimoAtaque > 1500) {
                        vidaTorre -= 10;
                        inimigo.ultimoAtaque = tempoAtual;
                        atualizarHUD();

                        if (vidaTorre <= 0) {
                            jogoAtivo = false;
                            telaGameOver.style.display = 'flex';
                            return; 
                        }
                    }
                }
            }

            gl.bindVertexArray(vao);
            gl.activeTexture(gl.TEXTURE0);
            gl.uniform1i(localTextura, 0);

            if (vidaMuro > 0) {
                gl.bindTexture(gl.TEXTURE_2D, texturaMuro);
                for (let i = 0; i < blocosMuro; i++) {
                    const y = canvas.height - (i + 1) * muroLargura - 20; 
                    const matrizBloco = criarMatrizModelo(muroX, y, muroLargura, muroLargura);
                    gl.uniformMatrix4fv(localMatrizModelo, false, matrizBloco);
                    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
                }
            }

            gl.bindTexture(gl.TEXTURE_2D, texturaTorre);
            gl.uniformMatrix4fv(localMatrizModelo, false, matrizModeloTorre);
            gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

            gl.bindTexture(gl.TEXTURE_2D, texturaInimigo);
            inimigos.forEach(inimigo => {
                const matrizInimigo = criarMatrizModelo(inimigo.x, inimigo.y, inimigoTamanho, inimigoTamanho, inimigo.flipX);
                gl.uniformMatrix4fv(localMatrizModelo, false, matrizInimigo);
                gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
            });

            gl.bindTexture(gl.TEXTURE_2D, texturaProjetil);
            projetis.forEach(p => {
                const matrizProjetil = criarMatrizModelo(p.x, p.y, projetilTamanho, projetilTamanho);
                gl.uniformMatrix4fv(localMatrizModelo, false, matrizProjetil);
                gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
            });

            requestAnimationFrame(desenharQuadro);
        }

        gl.clearColor(0.2, 0.3, 0.3, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindVertexArray(vao);
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform1i(localTextura, 0);
        
        gl.bindTexture(gl.TEXTURE_2D, texturaMuro);
        for (let i = 0; i < blocosMuro; i++) {
            const y = canvas.height - (i + 1) * muroLargura - 20; 
            const matrizBloco = criarMatrizModelo(muroX, y, muroLargura, muroLargura);
            gl.uniformMatrix4fv(localMatrizModelo, false, matrizBloco);
            gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
        }
        
        gl.bindTexture(gl.TEXTURE_2D, texturaTorre);
        gl.uniformMatrix4fv(localMatrizModelo, false, matrizModeloTorre);
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

    } catch (erro) {
        console.error(erro);
    }
}

iniciar();