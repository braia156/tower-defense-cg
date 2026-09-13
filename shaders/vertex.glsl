#version 300 es
in vec3 posicao;
in vec2 uv;
uniform mat4 matrizProjecao;
uniform mat4 matrizModelo;
out vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = matrizProjecao * matrizModelo * vec4(posicao, 1.0);
}