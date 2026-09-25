const canvas = document.getElementById('gameCanvas');
const gl = canvas.getContext('webgl2');

if (!gl) throw new Error('WebGL 2 indisponível');

const uiVida = document.getElementById('uiVida');
const uiPontos = document.getElementById('uiPontos');
const uiNivel = document.getElementById('uiNivel');
const telaGameOver = document.getElementById('telaGameOver');
const telaPause = document.getElementById('telaPause');
const btnReiniciar = document.getElementById('btnReiniciar');
const gameContainer = document.getElementById('gameContainer');
const dicaTelaCheia = document.getElementById('dicaTelaCheia');
const uiMoedas = document.getElementById('uiMoedas');
const indicadorBuff = document.getElementById('indicadorBuff');
const uiTempoBuff = document.getElementById('uiTempoBuff');

function ajustarEscala() {
    const escala = Math.min(window.innerWidth / canvas.width, window.innerHeight / canvas.height);
    gameContainer.style.transform = `scale(${escala})`;
}

window.addEventListener('resize', ajustarEscala);
ajustarEscala();

document.addEventListener('fullscreenchange', () => {
    dicaTelaCheia.innerText = document.fullscreenElement ? 'Pressione F para sair da tela cheia' : 'Pressione F para tela cheia';
});

let jogoAtivo = true;
let jogoPausado = false;
let multiplicadorDificuldade = 1.0;
let vidaTorre = 100;
let pontuacao = 0;
let nivel = 1;
let inimigos = [];
let projetis = [];
let moedas = [];
let moedasColetadas = 0;
let tempoBuff = 0;

const somTiro = new Audio('assets/sons/somTiro.wav');
const somDanoTorre = new Audio('assets/sons/somDanoTorre.wav');
const somDedada = new Audio('assets/sons/somDedada.wav');
const somMorteInimigo = new Audio('assets/sons/inimigo_morte_explosao_grave.wav');
const somGameOver = new Audio('assets/sons/somGameOver.mp3');
const somLevelUp = new Audio('assets/sons/somLevelUp.wav');
const somMoedaSurgindo = new Audio('assets/sons/moeda_surgindo.wav');
const somMoedaColetada = new Audio('assets/sons/moeda_pega.wav');
const trilhaSonora = new Audio('assets/sons/trilhaSonora.mp3');
trilhaSonora.loop = true;
trilhaSonora.volume = 0.4;

function tocarSom(som) {
    som.currentTime = 0;
    som.play().catch(() => {});
}

function tocarTrilha() {
    if (jogoAtivo && !jogoPausado) trilhaSonora.play().catch(() => {});
}

// o navegador só libera áudio depois da primeira interação do jogador
window.addEventListener('pointerdown', tocarTrilha, { once: true });
window.addEventListener('keydown', tocarTrilha, { once: true });

function atualizarHUD() {
    uiVida.innerText = vidaTorre;
    uiPontos.innerText = pontuacao;
    uiNivel.innerText = nivel;
    uiMoedas.innerText = moedasColetadas;
    uiTempoBuff.innerText = Math.ceil(tempoBuff / 1000);
    indicadorBuff.style.display = tempoBuff > 0 ? 'block' : 'none';
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
        const [fonteVertex, fonteFragment, texturaTorre, texturaInimigo, texturaProjetil, texturaCenario, texturaMoeda] = await Promise.all([
            carregarTexto('shaders/vertex.glsl'),
            carregarTexto('shaders/fragment.glsl'),
            carregarTextura(gl, 'assets/torre.png'),
            carregarTextura(gl, 'assets/inimigo.png'),
            carregarTextura(gl, 'assets/projetil.png'),
            carregarTextura(gl, 'assets/cenario.jpg'),
            carregarTextura(gl, 'assets/moeda.png')
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
        const localCorEfeito = gl.getUniformLocation(programa, "corEfeito");

        const torreLargura = 128;
        const torreAltura = 128;
        const torreX = (canvas.width / 2) - (torreLargura / 2);
        const torreY = (canvas.height / 2) - (torreAltura / 2);
        const matrizModeloTorre = criarMatrizModelo(torreX, torreY, torreLargura, torreAltura);
        const matrizModeloCenario = criarMatrizModelo(0, 0, canvas.width, canvas.height);

        const inimigoTamanho = 64;
        const velocidade = 100; 
        const projetilTamanho = 16;
        const velocidadeProjetil = 300;
        const raioAtaqueTorre = 250;
        const moedaTamanho = 32;
        const intervaloMoeda = 4000;
        const duracaoMoeda = 5000;
        const moedasParaBuff = 10;
        const duracaoBuff = 7000;
        const distanciaMinimaInimigos = 48;
        
        let tempoUltimoSpawn = 0;
        let tempoUltimoTiro = 0;
        let tempoAnterior;
        let tempoDeJogo = 0;
        let tempoUltimaMoeda = 0;

        window.addEventListener('keydown', (e) => {
            if (e.key === 'f' || e.key === 'F') {
                if (!document.fullscreenElement) document.documentElement.requestFullscreen();
                else document.exitFullscreen();
            }

            if ((e.key === 'p' || e.key === 'P' || e.key === 'Escape') && jogoAtivo) {
                jogoPausado = !jogoPausado;
                telaPause.style.display = jogoPausado ? 'flex' : 'none';
                
                if (!jogoPausado) {
                    tempoAnterior = performance.now();
                    requestAnimationFrame(desenharQuadro);
                    tocarTrilha();
                } else {
                    trilhaSonora.pause();
                }
            }
        });

        canvas.addEventListener('mousedown', (e) => {
            if (!jogoAtivo || jogoPausado) return;
            const rect = canvas.getBoundingClientRect();
            const mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
            const mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);

            for (let i = moedas.length - 1; i >= 0; i--) {
                const m = moedas[i];
                if (mouseX >= m.x && mouseX <= m.x + moedaTamanho &&
                    mouseY >= m.y && mouseY <= m.y + moedaTamanho) {
                    moedas.splice(i, 1);
                    moedasColetadas++;
                    tocarSom(somMoedaColetada);

                    if (moedasColetadas >= moedasParaBuff) {
                        moedasColetadas = 0;
                        tempoBuff = duracaoBuff;
                    }
                    atualizarHUD();
                    return;
                }
            }

            for (let i = inimigos.length - 1; i >= 0; i--) {
                const ini = inimigos[i];
                if (mouseX >= ini.x && mouseX <= ini.x + inimigoTamanho &&
                    mouseY >= ini.y && mouseY <= ini.y + inimigoTamanho) {
                    ini.vida -= tempoBuff > 0 ? ini.vida : 1;
                    tocarSom(somDedada);
                    break; 
                }
            }
        });

        btnReiniciar.addEventListener('click', () => {
            vidaTorre = 100;
            pontuacao = 0;
            inimigos = [];
            projetis = [];
            jogoAtivo = true;
            jogoPausado = false;
            multiplicadorDificuldade = 1.0;
            tempoDeJogo = 0;
            nivel = 1;
            moedas = [];
            moedasColetadas = 0;
            tempoBuff = 0;
            tempoUltimaMoeda = 0;
            telaGameOver.style.display = 'none';
            telaPause.style.display = 'none';
            atualizarHUD();
            tempoAnterior = performance.now();
            requestAnimationFrame(desenharQuadro);
            trilhaSonora.currentTime = 0;
            tocarTrilha();
        });

        function desenharQuadro(tempoAtual) {
            if (!jogoAtivo || jogoPausado) return;

            const delta = tempoAnterior === undefined ? 0 : (tempoAtual - tempoAnterior) / 1000;
            tempoAnterior = tempoAtual;
            tempoDeJogo += delta * 1000;

            multiplicadorDificuldade = 1.0 + (tempoDeJogo / 120000);

            const novoNivel = Math.floor(tempoDeJogo / 30000) + 1;
            if (novoNivel !== nivel) {
                nivel = novoNivel;
                atualizarHUD();
                tocarSom(somLevelUp);
            }

            if (tempoBuff > 0) {
                const segundosAntes = Math.ceil(tempoBuff / 1000);
                tempoBuff = Math.max(0, tempoBuff - delta * 1000);
                if (Math.ceil(tempoBuff / 1000) !== segundosAntes) atualizarHUD();
            }

            gl.clearColor(0.2, 0.3, 0.3, 1.0);
            gl.clear(gl.COLOR_BUFFER_BIT);

            if (tempoAtual - tempoUltimoSpawn > (2000 / multiplicadorDificuldade)) {
                const lado = Math.floor(Math.random() * 4); // 0 cima, 1 direita, 2 baixo, 3 esquerda
                let x, y;
                if (lado === 0)      { x = Math.random() * (canvas.width - inimigoTamanho);  y = -inimigoTamanho; }
                else if (lado === 1) { x = canvas.width;                                     y = Math.random() * (canvas.height - inimigoTamanho); }
                else if (lado === 2) { x = Math.random() * (canvas.width - inimigoTamanho);  y = canvas.height; }
                else                 { x = -inimigoTamanho;                                  y = Math.random() * (canvas.height - inimigoTamanho); }

                inimigos.push({
                    x,
                    y,
                    flipX: false,
                    vida: 3 + Math.floor(pontuacao / 200), 
                    ultimoAtaque: 0
                });
                tempoUltimoSpawn = tempoAtual;
            }

            if (tempoDeJogo - tempoUltimaMoeda > intervaloMoeda) {
                let x, y, distanciaTorre;
                do {
                    x = 50 + Math.random() * (canvas.width - 100 - moedaTamanho);
                    y = 50 + Math.random() * (canvas.height - 100 - moedaTamanho);
                    const dx = (torreX + torreLargura / 2) - (x + moedaTamanho / 2);
                    const dy = (torreY + torreAltura / 2) - (y + moedaTamanho / 2);
                    distanciaTorre = Math.sqrt(dx * dx + dy * dy);
                } while (distanciaTorre < 120);

                moedas.push({ x, y, criadaEm: tempoDeJogo });
                tempoUltimaMoeda = tempoDeJogo;
                tocarSom(somMoedaSurgindo);
            }

            for (let i = moedas.length - 1; i >= 0; i--) {
                if (tempoDeJogo - moedas[i].criadaEm > duracaoMoeda) moedas.splice(i, 1);
            }

            if (tempoAtual - tempoUltimoTiro > 1000) {
                let inimigoMaisProximo = null;
                let menorDistancia = Infinity;

                inimigos.forEach(inimigo => {
                    const dx = (torreX + torreLargura / 2) - (inimigo.x + inimigoTamanho / 2);
                    const dy = (torreY + torreAltura / 2) - (inimigo.y + inimigoTamanho / 2);
                    const distancia = Math.sqrt(dx * dx + dy * dy);

                    if (distancia < raioAtaqueTorre && distancia < menorDistancia) {
                        menorDistancia = distancia;
                        inimigoMaisProximo = inimigo;
                    }
                });

                if (inimigoMaisProximo) {
                    projetis.push({
                        x: torreX + (torreLargura / 2) - (projetilTamanho / 2),
                        y: torreY + (torreAltura / 2) - (projetilTamanho / 2),
                        alvo: inimigoMaisProximo
                    });
                    tempoUltimoTiro = tempoAtual;
                    tocarSom(somTiro);
                }
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
                    p.alvo.vida -= 1;
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
                    tocarSom(somMorteInimigo);
                    inimigos.splice(i, 1);
                    continue;
                }

                const inimigo = inimigos[i];
                const dx = (torreX + torreLargura / 2) - (inimigo.x + inimigoTamanho / 2);
                const dy = (torreY + torreAltura / 2) - (inimigo.y + inimigoTamanho / 2);
                const distancia = Math.sqrt(dx * dx + dy * dy);

                inimigo.flipX = dx < 0;

                if (distancia > 65) {
                    inimigo.x += (dx / distancia) * (velocidade * multiplicadorDificuldade) * delta;
                    inimigo.y += (dy / distancia) * (velocidade * multiplicadorDificuldade) * delta;
                } else {
                    if (tempoAtual - inimigo.ultimoAtaque > 1500) {
                        vidaTorre -= 10;
                        inimigo.ultimoAtaque = tempoAtual;
                        atualizarHUD();
                        tocarSom(somDanoTorre);

                        if (vidaTorre <= 0) {
                            jogoAtivo = false;
                            telaGameOver.style.display = 'flex';
                            trilhaSonora.pause();
                            tocarSom(somGameOver);
                            return; 
                        }
                    }
                }
            }

            for (let i = 0; i < inimigos.length; i++) {
                for (let j = i + 1; j < inimigos.length; j++) {
                    const a = inimigos[i];
                    const b = inimigos[j];
                    let dx = b.x - a.x;
                    let dy = b.y - a.y;
                    let distancia = Math.sqrt(dx * dx + dy * dy);
                    if (distancia === 0) { dx = 1; dy = 0; distancia = 1; }

                    if (distancia < distanciaMinimaInimigos) {
                        const empurrao = (distanciaMinimaInimigos - distancia) / 2;
                        a.x -= (dx / distancia) * empurrao;
                        a.y -= (dy / distancia) * empurrao;
                        b.x += (dx / distancia) * empurrao;
                        b.y += (dy / distancia) * empurrao;
                    }
                }
            }

            gl.bindVertexArray(vao);
            gl.activeTexture(gl.TEXTURE0);
            gl.uniform1i(localTextura, 0);

            gl.bindTexture(gl.TEXTURE_2D, texturaCenario);
            gl.uniformMatrix4fv(localMatrizModelo, false, matrizModeloCenario);
            gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

            gl.bindTexture(gl.TEXTURE_2D, texturaTorre);
            gl.uniformMatrix4fv(localMatrizModelo, false, matrizModeloTorre);
            if (tempoBuff > 0) {
                const t = tempoDeJogo / 100;
                gl.uniform4f(localCorEfeito,
                    0.5 + 0.5 * Math.sin(t),
                    0.5 + 0.5 * Math.sin(t + 2.1),
                    0.5 + 0.5 * Math.sin(t + 4.2),
                    0.5);
            }
            gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
            gl.uniform4f(localCorEfeito, 0, 0, 0, 0);

            gl.bindTexture(gl.TEXTURE_2D, texturaInimigo);
            inimigos.forEach(inimigo => {
                const matrizInimigo = criarMatrizModelo(inimigo.x, inimigo.y, inimigoTamanho, inimigoTamanho, inimigo.flipX);
                gl.uniformMatrix4fv(localMatrizModelo, false, matrizInimigo);
                gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
            });

            gl.bindTexture(gl.TEXTURE_2D, texturaMoeda);
            moedas.forEach(m => {
                const matrizMoeda = criarMatrizModelo(m.x, m.y, moedaTamanho, moedaTamanho);
                gl.uniformMatrix4fv(localMatrizModelo, false, matrizMoeda);
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

        requestAnimationFrame(desenharQuadro);

    } catch (erro) {
        console.error(erro);
    }
}

iniciar();