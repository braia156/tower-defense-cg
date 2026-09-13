#version 300 es
precision mediump float;
in vec2 vUv;
uniform sampler2D texturaAtiva;
out vec4 cor;

void main() {
    vec4 corTextura = texture(texturaAtiva, vUv);
    
    // Se o pixel for quase transparente, joga fora (não desenha nada)
    if(corTextura.a < 0.9) {
        discard;
    }
    
    cor = corTextura;
}