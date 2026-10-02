# Miniaturas dos personagens

Doze PNGs transparentes (176×176), cabeça e corpo dos seis modelos Kenney existentes em ../models/kenney. Derivados dos modelos originais, mantendo sua licença; nenhuma foto de usuário ou dado pessoal.

Geração: GLTFLoader + scripts/avatar-thumbnail-render.ts, cabeça real extraída pelo nó `head`, enquadramento ortográfico e luzes iguais para todos. scripts/avatar-thumbnail-cache.ts serializa a geração e evita duplicatas. Renderizar esses utilitários apenas em uma fixture local de desenvolvimento; exportar os rasters resultantes, conferir visualmente os seis modelos, e remover a fixture antes de publicar.

A interface usa apenas /avatars/character-{a,c,f,j,n,r}-{head,body}.png, com cache normal de imagens do navegador. Não cria contextos WebGL, não baixa GLTF nem mantém requestAnimationFrame para miniaturas. Os modelos 3D completos continuam utilizados normalmente no cenário.
