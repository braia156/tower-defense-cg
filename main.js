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

        console.log("Textos dos shaders carregados com sucesso!");
        // O próximo passo é compilar e linkar
        
    } catch (erro) {
        console.error("Deu erro:", erro);
    }
}

iniciar();