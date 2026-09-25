#version 300 es
precision mediump float;
in vec2 vUv;
uniform sampler2D texturaAtiva;
uniform vec4 corEfeito;
out vec4 cor;

void main() {
    vec4 corTextura = texture(texturaAtiva, vUv);
    
    if(corTextura.a < 0.9) {
        discard;
    }
    
    cor = corTextura;
    cor.rgb = mix(cor.rgb, corEfeito.rgb, corEfeito.a);
}