#version 300 es
in vec3 posicao;

void main() {
    gl_Position = vec4(posicao, 1.0);
}