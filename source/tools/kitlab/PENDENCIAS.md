# Pendências do complexo da pirâmide

Achados da checagem por cortes e do crítico, de 2026-11-26. A checagem comparou a entrada do jogo
(`meshKitEntrance`, em `src/meshes.js`) com a BuildingA do kit, em 38 cortes mais 13 extras.
Ficou para depois; nada disto foi alterado ainda. Para refazer a checagem, use
`node tools/kitlab/section_check.mjs entrance <pasta>` com o servidor do Kit Lab rodando e as malhas do kit
exportadas (LICOES, regra 15).

## Entrada (portão)

### Principais (aparecem no jogo)
1. **Telhado do salão.** O kit sai da fachada numa curva levemente abaulada e só vira reta por volta de
   z ≈ 20. O nosso desce em reta desde z ≈ 1 e fica 0,5 a 0,9 m mais baixo entre z 3 e 18.
   - Medidas: x=0, z≈8: kit 46,6 contra nosso 45,8; z=13: 45,6 contra 44,8.
   - O que fazer: curvar a cumeeira até z ≈ 20.
2. **Paredes entre a torre e o arco**, cerca de 2 m à frente. No kit:
   - a face fica em z ≈ -3,9, com um recuo no alto em z ≈ -3,4 (y de 24,7 a 27,3);
   - um pilar estreito encosta na torre (x de ±12,7 a ±14,6) e avança até z ≈ -4,7.
   - O nosso: um bloco único com a face em z -5,6 a -6,0.

### Menores
3. **Blocos laterais.**
   - O topo e o arremate contra o salão estão cerca de 0,6 m mais baixos: z=13 dá 25,3 contra 24,8;
     z=25 dá 21,4 contra 20,7; o arremate dá 28,3 contra 27,6.
   - A parede de fora está em ±19,6, contra ±19,2 no kit.
4. **Nicho da face de fora da torre.**
   - Abertura: o kit tem 1,6 m (z de -4,1 a -2,5); o nosso tem 2,6 m.
   - Ombreiras: no kit têm 0,9 m, ficam dentro da abertura e saem cerca de 0,5 m. As nossas têm 1,2 m e saem cerca de 1 m.
   - Verga: a nossa é pesada (y de 17,5 a 19, saindo 1,2 m); o kit tem só um arremate pequeno em y ≈ 16.
5. **Pé da torre** 0,5 m mais largo de cada lado: ±34,7 contra ±34,2. No topo a largura bate.

### Detalhes
6. **Fachada do arco** 0,6 m à frente: z -7,2 contra cerca de -6,7 no kit.
7. **Lado de dentro, atrás da fachada:** falta uma viga (y de 31,4 a 35,4, x=±6, z de -6,8 a -5,0) e uma saliência em y ≈ 39,5.
   Só aparece de dentro do salão.

### Fica como está (decidido)
- As costas da torre vão cerca de 2,7 m além das do kit.
- O capitel dos pilares do muro interno é em degraus.
- O braseiro no topo das torres fica: no kit é uma peça separada.

## Muro
- No Kit 3D, o muro do kit parece bem menor que o nosso. Conferir a escala e a altura com a checagem por cortes
  (`section_check.mjs wall`).
