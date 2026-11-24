# Lições do complexo da pirâmide (BldgLgPyramid_A)

Erros que já aconteceram ao reconstruir os modelos do kit KitBash3D *Age of Egypt*, e a regra que evita cada um.
Leia antes de mexer em qualquer modelo do kit, e siga o checklist no fim antes de dizer que um modelo está pronto.

## 1. Medir o kit, não estimar pelas fotos

**O que aconteceu:**
- O complexo foi montado a olho, a partir de 3 vistas por ativo. Saiu com o terraço do lado de fora do muro, as
  escadas viradas para o deserto e o complexo espelhado.
- A entrada virou uma cúpula e as torres ficaram inclinadas dos dois lados, quando no kit a inclinação é só na face
  externa.

**Regra:**
- A planta e as posições vêm do próprio arquivo do kit. Use `pyr_plan.py` para as caixas de cada peça e o pé do muro,
  e `pyr_wall_top.py` para onde o muro fica em pé. Ambos estão em `tools/kitlab/` e gravam em `reference/kb3d/plan/`.
- As formas vêm das vistas ortográficas: frente, lado e topo, em `reference/kb3d/pyramid_detail/`. Meça em pixels,
  converta para metros pela escala da foto e só então modele.
- Escala do kit para a cena: **2,4×**.
- Conversão de eixos: o Blender é (x, y, z) com z para cima e a frente em −y. Na cena isso vira (−x, z, y). Isso é um
  **espelho em x**: o lado leste do kit, onde fica o terraço, é o −x da cena.
- Ao colocar na cena uma peça assimétrica, gire 180° (`yaw PI`) e confira contra a foto. Para peças simétricas em z,
  esse giro equivale ao espelho.

## 2. Comparar sempre no Kit Lab antes de aplicar

**O que aconteceu:**
- Ajustes feitos direto no jogo voltavam com defeitos que só o usuário via: muro flutuando, faces faltando, muro
  entrando no complexo.

**Regra:**
- Todo ajuste de modelo começa em `tools/kitlab/workbench.js`. Copie a função de `src/meshes.js` para lá e edite lá.
- Rode `npm run kitlab` e compare com a foto do kit em todas as vistas: Frente, Trás, Esquerda, Direita, **Topo** e as
  quatro de 3/4. Compare também o **Complexo inteiro**, não só a peça isolada.
- A barra de medidas (nosso × kit 2,4×) tem que ficar a menos de ~2 m em cada eixo, ou a diferença tem que estar
  explicada.
- Só depois da aprovação do usuário a função volta para `src/meshes.js`.

## 3. Nada pode flutuar: base enterrada

**O que aconteceu:**
- O muro começava exatamente em y = 0. Onde a areia afundava entre os vértices do terreno, aparecia uma fresta escura
  embaixo dele.

**Regra:**
- Toda peça apoiada no chão tem base que entra **pelo menos 2 m abaixo do nível do terreno**: rodapé, plinto ou
  sapata.
- O muro do kit tem rodapé inclinado (2,5 m para fora, 1,6 m de altura). Reproduza esse tipo de detalhe; ele também
  esconde a junção com a areia.

## 4. Faces: nenhuma peça aberta

**O que aconteceu:**
- `box(..., false)` foi usado em dezenas de peças. Esse `false` omite a face de baixo, e arquitraves, cornijas e
  balanços apareciam ocos vistos de baixo.
- Outras peças tinham bordas abertas:
  - o teto da entrada, aberto atrás;
  - as bocas dos potes;
  - as pontas das toras;
  - a flâmula do estandarte;
  - as faixas feitas com `lathe` de dois pontos, que são anéis sem tampa.

**Regra:**
- `box(...)` **sem** o último argumento. Use `false` só se a face de baixo estiver comprovadamente encostada em outra
  superfície, e escreva o porquê no comentário.
- `tube(...)` com tampa (sem `false`) quando a ponta pode ser vista. Faça a outra ponta começar dentro de outra peça.
- `lathe` de faixa ou anel: perfil fechado, de 4 pontos (dentro, fora, fora, dentro).
- Lajes e peças finas (`poly` dos dois lados): feche as bordas laterais.
- No Kit Lab, **"Faces faltando em magenta"** tem que dar zero em toda peça isolada, em todas as vistas.

## 5. Nunca duas faces no mesmo plano

**O que aconteceu:**
- O bloco do cais e o piso estavam no mesmo plano e piscavam (z-fighting).
- As faixas douradas tinham a base exatamente no topo do telhado.

**Regra:**
- Peça apoiada sobre outra: afaste pelo menos **2 cm** (base 0,02 acima do topo da de baixo), ou rebaixe a de baixo.

## 6. Um elemento por função, sem atravessar outro

**O que aconteceu:**
- O muro lateral continuava por dentro da baía do terraço e formava um "T" dentro do complexo.
- Os pilares subiam 3,6 m acima do muro; no kit quase não se destacam.

**Regra:**
- Cada trecho de muro termina onde o kit termina. Confira na vista **Topo** do Kit Lab, sobrepondo a foto
  (opacidade ~50%).
- Alturas de pilares, cornijas e coroamentos vêm da elevação do kit, nunca de um valor arbitrário.

## 7. Comentários `//` no meio de uma linha

**O que aconteceu (4 vezes):**
- Um comentário `//` inserido no meio de uma linha engoliu o resto dela: um `}`, um `else`, uma declaração do shader.
  A página do Kit Lab ou o WGSL quebravam.

**Regra:**
- Comentário no meio da linha usa `/* ... */`. Comentário `//` só no fim real da linha.
- Depois de editar, confira a sintaxe: `npm run kitlab:build`, depois `node --check` no script extraído da página
  (veja o teste no fim). Para o jogo: `node build.mjs --dev` e abrir sem erros de WGSL.

## 8. Testar o lugar certo

**O que aconteceu:**
- Câmeras de teste ficaram abaixo do chão (o terraço do complexo fica em y = 5) ou dentro de prédios. Isso gerou
  imagens inúteis e conclusões erradas.
- O `dev.html` foi apagado antes do benchmark, que então falhou.

**Regra:**
- Câmeras no complexo com y ≥ 7 (chão a 5 m + 2 m de olho). Para olhar algo de baixo, ponha a câmera no chão e
  aponte para cima.
- Servidor de testes (`serve.mjs`): no Windows, passe a raiz com barras invertidas (`'D:\VSCodetlantis'`). Com
  `D:/...` ele responde 404 para tudo e o teste falha com `requestAdapter` indefinido, que parece falta de WebGPU.
  Antes de concluir qualquer coisa sobre o navegador, confira `curl http://127.0.0.1:8123/dev.html` → 200.
- Benchmark: rode `node build.mjs --dev` antes. Se o resultado oscilar, faça um A/B (versão publicada × nova) na
  mesma máquina antes de concluir qualquer coisa.

## 9. Efeitos do shader presos a uma altura fixa: usar o chão do lugar

**O que aconteceu:**
- A areia acumulada no pé das paredes (`bank` em `sh_scene.js`) e a poeira no pé do granito usam uma altura de chão
  (`gy`) como referência.
- Ao corrigir o cais, deixei a altura do complexo (`FARPYR.y` = 5 m) valendo só numa faixa de |x| < 46 m. No resto
  do complexo valia a altura do chão da cidade (`LAND` = 10 m).
- Resultado: uma faixa de areia flutuando 5 m acima da base na pirâmide, nos muros e no terraço, e certa só num
  trecho. Confundi com reflexo do granito; o usuário viu que não era.

**Regra:**
- Todo efeito que depende de "altura acima do chão" (areia no pé, poeira, manchas de umidade, linha d'água) usa o
  chão **daquele lugar**: `FARPYR.y` em toda a margem do complexo (`p.z > FARPYR.zb - 60`), `LAND` na cidade. Nunca
  restringir por uma faixa de x ou z menor que a área onde há construções.
- Ao mudar o nível do terreno ou a área de um efeito, procurar **todos** os usos da mesma referência
  (`grep -n "LAND\|FARPYR.y" src/sh_scene.js`) e conferir cada um.
- Conferir de perto, na altura dos olhos, **em vários pontos do complexo** (frente, lados, baía do terraço, fundo),
  não só no trecho onde a mudança foi feita. Um efeito certo num pedaço e errado no resto é sinal de limite de área.
- Antes de explicar um defeito visual ("é reflexo", "é sombra"), confirmar a causa no código. Na dúvida, desligar o
  efeito suspeito e renderizar de novo.

## 10. Faces coplanares também no topo do muro

**O que aconteceu:**
- O miolo entre as ameias tinha o topo na mesma altura do topo das ameias. As duas faces disputavam o mesmo plano e
  piscavam no meio do muro.

**Regra:**
- Vale a regra 5 também para peças empilhadas lado a lado: se duas peças chegam à mesma altura, uma fica pelo menos
  2–4 cm abaixo. Conferir olhando de cima, ao longo do topo do muro.

## 11. Crítico no Kit Lab: no mínimo 2 rodadas

**O que aconteceu:**
- Modelos foram dados como prontos depois de uma conferência minha só. O usuário então achou defeitos que um
  segundo olhar teria pego: complexo espelhado, muro flutuando, muro atravessando a baía.

**Regra:**
- Antes de pedir aprovação, um **crítico** (subagente que não vê o código, só as imagens) revisa o modelo no Kit Lab
  em **pelo menos 2 rodadas**.
- **Material de cada rodada:**
  - capturas do Kit Lab, nosso modelo ao lado da foto do kit, nas vistas Frente, Trás, Esquerda, Direita, Topo e nas
    quatro de 3/4;
  - as mesmas vistas do **Complexo inteiro**;
  - a vista Topo com a foto sobreposta (opacidade ~50%);
  - a barra de medidas (nosso × kit 2,4×);
  - a contagem de magenta por vista.
- **O crítico responde:**
  - uma tabela de fidelidade por elemento (bate / em parte / falta / errado), com a mudança necessária;
  - os defeitos por severidade (Crítica / Maior / Moderada / Menor);
  - na última linha, `Maior severidade restante: <...>`.
- **Rodada 1:** revisão completa. Corrijo tudo o que for acima de Menor.
- **Rodada 2 em diante:** mesmo crítico, retomado com `SendMessage` para manter o contexto. Para cada defeito da
  rodada anterior ele diz corrigido / melhorou / igual, e aponta regressões.
- **Encerramento:** só depois de no mínimo 2 rodadas **e** com nada acima de Menor. Um defeito que resistir a 3
  tentativas reais vira limitação conhecida, registrada e mostrada ao usuário, como manda o `prompt.txt`.
- **Para o usuário:** o veredito da última rodada, a tabela de fidelidade e as limitações. Só então peço aprovação
  para aplicar em `src/`.

Capturas para o crítico, em `tools/kitlab/shots/` (precisam de `puppeteer-core` e do Chrome instalado; o servidor
do Kit Lab não precisa estar ligado). Eles abrem `tools/kitlab/kitlab.html` e usam `window.__kitlab.pick(id)`,
`setView(v)` e `look(olho, alvo)`:

```
node tools/kitlab/shots/kitlab_test.mjs  <pasta>                          # vistas fixas de alguns modelos
node tools/kitlab/shots/kitlab_backs.mjs <pasta>                          # magenta por modelo e vista (faces faltando)
node tools/kitlab/shots/kitlab_look.mjs  <pasta> complex "nome:ex,ey,ez,ax,ay,az"   # câmera livre
```

## Checklist antes de dizer "pronto"

- [ ] Medidas vindas do kit (`plan.json` e ortográficas), escala 2,4×, espelho em x aplicado.
- [ ] Kit Lab: peça isolada e complexo comparados em todas as vistas, incluindo Topo com sobreposição.
- [ ] Barra de medidas: diferença ≤ ~2 m por eixo, ou explicada.
- [ ] Magenta = 0 em toda peça isolada.
- [ ] Nada apoiado no chão sem base enterrada ≥ 2 m.
- [ ] Nenhuma face coplanar (afastamento ≥ 2 cm).
- [ ] Efeitos por altura (areia, poeira, umidade) presos ao chão do lugar, conferidos em vários pontos do complexo.
- [ ] Nenhum trecho atravessando outro elemento.
- [ ] Página do Kit Lab e `dev.html` sem erros de sintaxe nem de WGSL.
- [ ] Crítico no Kit Lab: **≥ 2 rodadas**, a última sem nada acima de Menor (ou limitações registradas).
- [ ] Só então pedir aprovação; aplicar em `src/` só depois do "sim".

## Teste rápido de sintaxe do Kit Lab

```
cd source
npm run kitlab:build
node -e "const fs=require('fs');const h=fs.readFileSync('tools/kitlab/kitlab.html','utf8');fs.writeFileSync('kl_check.js',h.split('<script>')[1].split('</script>')[0])"
node --check kl_check.js && del kl_check.js
```
